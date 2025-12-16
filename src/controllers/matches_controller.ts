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

const getFeaturedMatch: RequestHandler = async (_req, res) => {
  try {
    // Choose the most recent active game as featured for now
    const [game] = await chessService.getActiveGames(0, 1);
    if (!game) return res.status(404).json({ error: 'No active matches' });

    const { initial_seconds, increment_seconds } = parseTimeControl(game.time_format);
    const moveN = game.move_hist?.length || 0;

    const dto: any = {
      match_id: String(game._id),
      status: mapStatus(game.game_status),
      time_control: { initial_seconds, increment_seconds },
      players: [
        { username: game.player_white?.name, rating: game.player_white?.elo, color: 'white' },
        { username: game.player_black?.name, rating: game.player_black?.elo, color: 'black' },
      ],
      clocks: game.game_status === GameStatus.IN_PROGRESS ? {
        white_ms: Math.max(0, Number(game.time_white || 0) * 1000),
        black_ms: Math.max(0, Number(game.time_black || 0) * 1000),
      } : undefined,
      opening: undefined, // optional; FE will fallback to Move N • phase
      stakes: {
        tier: 'High Stakes',
        min_bet: 1,
        max_bet: Number(process.env.ARCADE_MAX_STAKE_WDL || 50),
        currency: 'BET',
      },
      source: { provider: 'lichess', url: undefined },
      stats: undefined,
      meta: {
        move_number: moveN,
        phase: getPhase(moveN),
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

    const dto: any = {
      match_id: String(game._id),
      status: mapStatus(game.game_status),
      time_control: { initial_seconds, increment_seconds },
      players: [
        { username: game.player_white?.name, rating: game.player_white?.elo, color: 'white' },
        { username: game.player_black?.name, rating: game.player_black?.elo, color: 'black' },
      ],
      clocks: game.game_status === GameStatus.IN_PROGRESS ? {
        white_ms: Math.max(0, Number(game.time_white || 0) * 1000),
        black_ms: Math.max(0, Number(game.time_black || 0) * 1000),
      } : undefined,
      opening: undefined, // optional; FE will fallback to Move N • phase
      stakes: {
        tier: 'High Stakes',
        min_bet: 1,
        max_bet: Number(process.env.ARCADE_MAX_STAKE_WDL || 50),
        currency: 'BET',
      },
      source: { provider: 'lichess', url: undefined },
      stats: agg ? { total_bets: agg.total_bets || 0, total_pool: agg.total_pool || 0 } : { total_bets: 0, total_pool: 0 },
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
