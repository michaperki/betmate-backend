import { Types } from 'mongoose';
import { Wager } from '../models';

export type OutcomeKey = 'white_win' | 'draw' | 'black_win';

export type OutcomeExposure = Record<OutcomeKey, number>;

export interface GameExposure {
  gameId: string;
  perOutcome: OutcomeExposure;
  worstCase: number;
}

const emptyExposure = (): OutcomeExposure => ({ white_win: 0, draw: 0, black_win: 0 });

function addLiability(map: OutcomeExposure, outcome: string, liability: number) {
  if (outcome === 'white_win' || outcome === 'black_win' || outcome === 'draw') {
    map[outcome] += Math.max(0, liability);
  }
}

function worstCase(exp: OutcomeExposure): number {
  return Math.max(exp.white_win, exp.draw, exp.black_win);
}

/**
 * Compute exposure (liabilities) for a specific game across Real WDL wagers.
 */
export async function getGameExposure(gameId: string): Promise<GameExposure> {
  const perOutcome = emptyExposure();
  const rows = await Wager.find({
    game_id: Types.ObjectId(gameId),
    wdl: true,
    mode: 'real',
    resolved: false,
  }).select('amount odds data').lean();

  for (const w of rows || []) {
    const odds = Math.max(1, Number((w as any).odds || 1));
    const stake = Math.max(0, Number((w as any).amount || 0));
    const liability = stake * (odds - 1);
    addLiability(perOutcome, String((w as any).data), liability);
  }
  return { gameId, perOutcome, worstCase: worstCase(perOutcome) };
}

/**
 * Compute global exposure (sum of worst-case per game) across all live Real WDL wagers.
 */
export async function getGlobalExposure(): Promise<{ total: number; byGame: GameExposure[] }> {
  const rows = await Wager.find({ wdl: true, mode: 'real', resolved: false })
    .select('game_id data amount odds')
    .lean();
  const byGame = new Map<string, OutcomeExposure>();
  for (const w of rows || []) {
    const gid = String((w as any).game_id);
    if (!byGame.has(gid)) byGame.set(gid, emptyExposure());
    const odds = Math.max(1, Number((w as any).odds || 1));
    const stake = Math.max(0, Number((w as any).amount || 0));
    const liability = stake * (odds - 1);
    addLiability(byGame.get(gid) as OutcomeExposure, String((w as any).data), liability);
  }
  const list: GameExposure[] = Array.from(byGame.entries()).map(([gid, exp]) => ({ gameId: gid, perOutcome: exp, worstCase: worstCase(exp) }));
  const total = list.reduce((s, g) => s + g.worstCase, 0);
  return { total, byGame: list };
}

/**
 * Compute a user's current per-game WDL liability (Real mode only)
 */
export async function getPlayerGameLiability(gameId: string, userId: string): Promise<number> {
  const rows = await Wager.find({
    game_id: Types.ObjectId(gameId),
    wdl: true,
    mode: 'real',
    resolved: false,
    better_id: Types.ObjectId(userId),
  }).select('amount odds').lean();
  return (rows || []).reduce((s, w: any) => {
    const odds = Math.max(1, Number(w.odds || 1));
    const stake = Math.max(0, Number(w.amount || 0));
    return s + stake * (odds - 1);
  }, 0);
}

