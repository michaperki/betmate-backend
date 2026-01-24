import { RequestHandler } from 'express';
import { chessService } from '../services';
import { Wager } from '../models';
import { GameStatus } from '../types/models/chess';

function mapStatus(s: GameStatus | string): 'not_started' | 'in_progress' | 'finished' {
  if (s === GameStatus.NOT_STARTED || s === 'not_started') return 'not_started';
  if (s === GameStatus.IN_PROGRESS || s === 'in_progress') return 'in_progress';
  return 'finished';
}

function parseTimeControl(time_format?: string): { initial_seconds: number, increment_seconds: number } {
  // Expected like "300+0" (seconds+increment)
  if (!time_format) return { initial_seconds: 180, increment_seconds: 0 };
  const parts = String(time_format).split('+');
  const initial = Number(parts[0] || 180);
  const inc = Number(parts[1] || 0);
  return { initial_seconds: Number.isFinite(initial) ? initial : 180, increment_seconds: Number.isFinite(inc) ? inc : 0 };
}

function getPhase(moveCount: number): 'Opening' | 'Midgame' | 'Endgame' {
  if (moveCount < 12) return 'Opening';
  if (moveCount < 30) return 'Midgame';
  return 'Endgame';
}

function speedFromTime(initial_seconds?: number): 'Bullet' | 'Blitz' | 'Rapid' | 'Classical' {
  const minutes = Math.round((initial_seconds || 0) / 60);
  if (minutes <= 2) return 'Bullet';
  if (minutes <= 5) return 'Blitz';
  if (minutes <= 15) return 'Rapid';
  return 'Classical';
}

function ratingFlair(maxElo: number): '' | 'Elite' | 'Master' {
  if (maxElo >= 2600) return 'Elite';
  if (maxElo >= 2400) return 'Master';
  return '';
}

function deriveBaseTier(initial_seconds: number, whiteElo: number, blackElo: number): string {
  const speed = speedFromTime(initial_seconds);
  const maxElo = Math.max(Number(whiteElo || 0), Number(blackElo || 0));
  const flair = ratingFlair(maxElo);
  return flair ? `${flair} ${speed}` : speed;
}

function computeStakeTier(perCurrency: Record<string, { total_pool: number }>): 'High Stakes' | 'Medium Stakes' | '' {
  // Env-tunable thresholds (defaults chosen conservatively)
  const USDT_HIGH = Number(process.env.STAKE_TIER_USDT_HIGH || 500);
  const USDT_MED = Number(process.env.STAKE_TIER_USDT_MED || 100);
  const BET_HIGH = Number(process.env.STAKE_TIER_BET_HIGH || 500);
  const BET_MED = Number(process.env.STAKE_TIER_BET_MED || 100);

  const usdt = Number(perCurrency?.USDT?.total_pool || 0);
  const bet = Number(perCurrency?.BET?.total_pool || 0);

  if (usdt >= USDT_HIGH || bet >= BET_HIGH) return 'High Stakes';
  if (usdt >= USDT_MED || bet >= BET_MED) return 'Medium Stakes';
  return '';
}

function isTimeTrouble(whiteSeconds?: number, blackSeconds?: number): boolean {
  const THRESH = Number(process.env.TIME_TROUBLE_SECONDS || 60);
  const w = Number(whiteSeconds || 0);
  const b = Number(blackSeconds || 0);
  if (w <= 0 || b <= 0) return false; // avoid pregame zeros being flagged
  return (w <= THRESH || b <= THRESH);
}

const getFeaturedMatch: RequestHandler = async (_req, res) => {
  try {
    // Prefer an in‑progress game; fall back to the most recent not‑started one
    let [game] = await chessService.getManyChessGames(
      { game_status: GameStatus.IN_PROGRESS, complete: { $ne: true } },
      undefined,
      { created_at: -1 },
      1
    );
    if (!game) {
      [game] = await chessService.getManyChessGames(
        { game_status: GameStatus.NOT_STARTED, complete: { $ne: true } },
        undefined,
        { created_at: -1 },
        1
      );
    }
    if (!game) return res.status(404).json({ error: 'No active matches' });

    const { initial_seconds, increment_seconds } = parseTimeControl(game.time_format);
    const moveN = game.move_hist?.length || 0;

    // Aggregate per-currency totals for a single game (lightweight)
    const byCurrencyAgg = await (Wager as any).aggregate([
      { $match: { game_id: game._id } },
      { $group: { _id: '$currency', total_pool: { $sum: '$amount' } } },
    ]).allowDiskUse(true);
    const perCurrency: Record<string, { total_pool: number }> = { BET: { total_pool: 0 }, USDT: { total_pool: 0 } };
    for (const row of byCurrencyAgg || []) {
      const key = (row?._id || 'BET');
      perCurrency[key] = { total_pool: Number(row?.total_pool || 0) };
    }

    // Tag only when meaningful; otherwise no baseline tag
    let tier = '';
    // Time Pressure override if clocks are low
    const whiteSec = Number(game.time_white || 0);
    const blackSec = Number(game.time_black || 0);
    const live = (game.game_status === GameStatus.IN_PROGRESS) || (moveN > 0);
    if (live && isTimeTrouble(whiteSec, blackSec)) {
      tier = 'Time Trouble';
    }

    const liveStatus = (game.game_status === GameStatus.IN_PROGRESS) || (moveN > 0);
    const dto: any = {
      match_id: String(game._id),
      status: liveStatus ? 'in_progress' : mapStatus(game.game_status),
      time_control: { initial_seconds, increment_seconds },
      players: [
        { username: game.player_white?.name, rating: game.player_white?.elo, color: 'white' },
        { username: game.player_black?.name, rating: game.player_black?.elo, color: 'black' },
      ],
      clocks: (game.game_status === GameStatus.IN_PROGRESS || (game.move_hist?.length || 0) > 0) ? {
        white_ms: Math.max(0, Number(game.time_white || 0) * 1000),
        black_ms: Math.max(0, Number(game.time_black || 0) * 1000),
      } : undefined,
      opening: undefined, // optional; FE will fallback to Move N • phase
      stakes: {
        tier,
        min_bet: 1,
        max_bet: Number(process.env.ARCADE_MAX_STAKE_WDL || 50),
        currency: 'BET',
      },
      source: { provider: 'lichess', url: undefined },
      stats: undefined,
      meta: {
        move_number: moveN,
        phase: getPhase(moveN),
        side_to_move: (game.state || '').split(' ')[1] === 'w' ? 'white' : 'black',
      },
    };

    return res.json(dto);
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Failed to load featured match' });
  }
};

  const getMatchDetails: RequestHandler = async (req, res) => {
  try {
    const id = req.params.id;
    const game = await chessService.getChessGame(id);
    if (!game) return res.status(404).json({ error: 'Match not found' });

    const { initial_seconds, increment_seconds } = parseTimeControl(game.time_format);
    const moveN = game.move_hist?.length || 0;

    // Aggregate simple stats (total bets and pool size)
    const [agg] = await (Wager as any).aggregate([
      { $match: { game_id: game._id } },
      { $group: { _id: null, total_pool: { $sum: '$amount' }, total_bets: { $sum: 1 } } },
    ]).allowDiskUse(true);

    // Per-currency (units-aware) stats for FE mode-specific display
    const byCurrencyAgg = await (Wager as any).aggregate([
      { $match: { game_id: game._id } },
      { $group: { _id: '$currency', total_pool: { $sum: '$amount' }, total_bets: { $sum: 1 } } },
    ]).allowDiskUse(true);
    const stats_by_currency: any = { BET: { total_bets: 0, total_pool: 0 }, USDT: { total_bets: 0, total_pool: 0 } };
    for (const row of byCurrencyAgg || []) {
      const key = (row?._id || 'BET') as 'BET' | 'USDT';
      stats_by_currency[key] = { total_bets: row?.total_bets || 0, total_pool: row?.total_pool || 0 };
    }

    // Compute tag with same logic as featured (no baseline tag)
    let tier = '';
    const whiteSec = Number(game.time_white || 0);
    const blackSec = Number(game.time_black || 0);
    const live = (game.game_status === GameStatus.IN_PROGRESS) || (moveN > 0);
    if (live && isTimeTrouble(whiteSec, blackSec)) {
      tier = 'Time Trouble';
    }

    // no baseline tier; keep tier as set above (time pressure only)

    const liveStatus2 = (game.game_status === GameStatus.IN_PROGRESS) || (moveN > 0);
    const dto: any = {
      match_id: String(game._id),
      status: liveStatus2 ? 'in_progress' : mapStatus(game.game_status),
      time_control: { initial_seconds, increment_seconds },
      players: [
        { username: game.player_white?.name, rating: game.player_white?.elo, color: 'white' },
        { username: game.player_black?.name, rating: game.player_black?.elo, color: 'black' },
      ],
      clocks: (game.game_status === GameStatus.IN_PROGRESS || (game.move_hist?.length || 0) > 0) ? {
        white_ms: Math.max(0, Number(game.time_white || 0) * 1000),
        black_ms: Math.max(0, Number(game.time_black || 0) * 1000),
      } : undefined,
      opening: undefined, // optional; FE will fallback to Move N • phase
      stakes: {
        tier,
        min_bet: 1,
        max_bet: Number(process.env.ARCADE_MAX_STAKE_WDL || 50),
        currency: 'BET',
      },
      source: { provider: 'lichess', url: undefined },
      stats: agg ? { total_bets: agg.total_bets || 0, total_pool: agg.total_pool || 0 } : { total_bets: 0, total_pool: 0 },
      stats_by_currency,
      meta: {
        move_number: moveN,
        phase: getPhase(moveN),
        last_move_san: game.move_hist?.[moveN - 1]?.san || undefined,
        side_to_move: (game.state || '').split(' ')[1] === 'w' ? 'white' : 'black',
      },
      odds: (game as any)?.odds || undefined,
    };

    return res.json(dto);
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Failed to load match details' });
  }
};

const matchesController = { getFeaturedMatch, getMatchDetails };
export default matchesController;
