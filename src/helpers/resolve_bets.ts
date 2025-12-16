import { UpdateQuery, Types } from 'mongoose';
import { userService, wagerService } from '../services';
import { UserDoc } from '../types/models/user';
import {
  ProcessedWager, UserWagers, UserWinnings, WagerDoc, WagerOutcomes, WagerProcessor, WagerResults, WagerStatus,
} from '../types/models/wager';

import { delay, generateCorrelationId } from './utils';
import logger from '../helpers/axiom_logger';

const verboseGameLogs = process.env.LOG_GAME_EVENTS === 'true';

/**
 * Construct function to process `WagerDoc` into `ProcessedWager`
 * @param correctWager Outcome that wagers will be compared to
 * @param winningPoolShare For pool betting, determined odds for winners of pool
 * @param returnWagers For pool betting, for when no one wins pool
 */
export const processWager = (correctWager: string, winningPoolShare = 1, returnWagers = false) => (
  (wager: WagerDoc): ProcessedWager => {
    const baseWager = { _id: wager._id, better_id: wager.better_id, mode: wager.mode, currency: wager.currency } as Partial<ProcessedWager>;
    // WDL (game outcome): both Arcade and Real use stored fixed odds at bet-time
    // Move: Arcade uses fixed odds; Real uses pool share
    const useShare = (wager.mode === 'real') && !wager.wdl;
    const odds = useShare ? winningPoolShare : wager.odds;

    switch (true) {
      case returnWagers:
        return { ...(baseWager as any), outcome: WagerStatus.CANCELLED, winnings: wager.amount } as ProcessedWager;
      case wager.data === correctWager:
        return {
          ...(baseWager as any),
          outcome: WagerStatus.WON,
          winnings: wager.amount * odds,
          ...(useShare ? { applied_share: odds } : {}),
        } as ProcessedWager;
      default:
        return { ...(baseWager as any), outcome: WagerStatus.LOST, winnings: 0 } as ProcessedWager;
    }
  }
);

/**
 * Process WDL `wagers` based on correct outcome
 * @param wagers made on outcome
 * @param correctOutcome determines which wagers win
 * @returns Processed `wagers`
 */
export const processWDLWagers: WagerProcessor = (wagers, correctOutcome) => ({
  // Both Arcade and Real use stored fixed odds for WDL; no parimutuel share or rake
  processedWagers: (() => {
    const list = wagers.map(processWager(correctOutcome));
    try {
      const hadAny = wagers.length > 0;
      const level: 'info' | 'debug' = hadAny ? 'info' : 'debug';
      logger.log({ level, event: 'wdl_settlement', context: { outcome: correctOutcome, wagers: wagers.length, mode: 'fixed_odds' } });
    } catch {}
    return list;
  })(),
});

/**
 * Process pool `wagers` based on correct outcome
 * @param wagers made on outcome
 * @param correctOutcome determines which wagers win
 * @returns Processed `wagers`, and share of the pool that the winners get
 */
export const processCriticalMoveWagers: WagerProcessor = (wagers, correctMove) => {
  // Apply rake for Real mode only
  const rake = Math.max(0, Math.min(0.25, Number(process.env.POOL_RAKE || 0.05)));

  const arcade = wagers.filter(w => w.mode !== 'real');
  const real = wagers.filter(w => w.mode === 'real');

  // Arcade is house-priced fixed odds: never refund due to "no winners"
  // Winners are paid by stored odds; losers lose stakes. No parimutuel share used.
  const totalArcade = arcade.reduce((sum, w) => sum + w.amount, 0);
  const winArcade = arcade.filter(w => w.data === correctMove).reduce((s, w) => s + w.amount, 0);
  const returnArcade = false;
  const shareArcade = 1; // ignored for Arcade move bets (fixed odds used instead)

  const totalReal = real.reduce((sum, w) => sum + w.amount, 0);
  const winReal = real.filter(w => w.data === correctMove).reduce((s, w) => s + w.amount, 0);
  const returnReal = winReal === 0;
  const shareReal = returnReal ? Number.MAX_SAFE_INTEGER : ((totalReal * (1 - rake)) / winReal);

  const processedWagers: ProcessedWager[] = [];
  processedWagers.push(
    ...arcade.map(processWager(correctMove, shareArcade, returnArcade)),
    ...real.map(processWager(correctMove, shareReal, returnReal)),
  );

  try {
    const rakeCollected = returnReal ? 0 : (totalReal * rake);
    const hadAny = (totalArcade + totalReal) > 0;
    const level: 'info' | 'debug' = hadAny ? 'info' : 'debug';
    logger.log({ level, event: 'move_settlement', context: { move: correctMove, totals: { totalArcade, totalReal }, winReal, returnReal, shareReal, rake, rakeCollected } });
  } catch {}

  return { processedWagers };
};

/**
 * Get each users winnings from set of processed wagers
 * @param pw processed wagers
 * @returns JSON mapping user IDs to their winnings
 */
export const getUserWinnings = (pw: ProcessedWager[]): UserWinnings => (
  pw.reduce((uw, w) => {
    const userID = String(w.better_id);
    return {
      ...uw,
      [userID]: (uw[userID] || 0) + w.winnings,
    };
  }, {})
);

// Compute wallet-credits per user by currency (BET vs USDT)
const getUserWalletCredits = (pw: ProcessedWager[]): Record<string, { BET?: number; USDT?: number }> => (
  pw.reduce((map, w) => {
    if (!w.winnings || w.winnings <= 0) return map;
    const userID = String(w.better_id);
    const curr = (w.currency === 'USDT') ? 'USDT' : 'BET';
    const prev = map[userID] || {};
    return { ...map, [userID]: { ...prev, [curr]: (prev[curr as 'BET' | 'USDT'] || 0) + w.winnings } };
  }, {} as Record<string, { BET?: number; USDT?: number }>)
);

/**
 * Group `wagers` by user ID
 * @param wagers array of `WagerDoc`
 * @returns JSON mapping user IDs to their wagers
 */
export const getUserWagers = (wagers: WagerDoc[]): UserWagers => (
  wagers.reduce((userWagers, w) => {
    const userID = String(w.better_id);
    return {
      ...userWagers,
      [userID]: [...(userWagers[userID] || []), w],
    };
  }, {})
);

/**
 * Group processed wagers by their outcome
 * @param pw array of processed wagers
 * @returns JSON mapping wager outcomes to an array of wagers IDs with that outcome
 */
export const getWagerResults = (pw: ProcessedWager[]): WagerResults => {
  // Treat Arcade wagers as win/lose only — never cancelled; Real pool bets may be cancelled
  const winners = pw.filter((w) => w.outcome === WagerStatus.WON).map((w) => w._id);
  const lost = pw
    .filter((w) => w.outcome === WagerStatus.LOST || (w.outcome === WagerStatus.CANCELLED && w.mode !== 'real'))
    .map((w) => w._id);
  const cancelled = pw
    .filter((w) => w.outcome === WagerStatus.CANCELLED && w.mode === 'real')
    .map((w) => w._id);
  return {
    [WagerStatus.WON]: winners,
    [WagerStatus.LOST]: lost,
    [WagerStatus.CANCELLED]: cancelled,
  };
};

/**
 * Update `User` accounts with their winnings
 * @param userWinnings JSON mapping user IDs to their wagers
 * @returns Array of updated `UserDoc`
 */
const updateUserWinnings = async (processedWagers: ProcessedWager[]): Promise<UserDoc[]> => {
  const credits = getUserWalletCredits(processedWagers);
  const updates = Object.entries(credits).map(async ([id, amounts]) => {
    const inc: any = {};
    if (amounts.BET && amounts.BET > 0) {
      inc.account = (inc.account || 0) + amounts.BET;
      inc.token_balance = (inc.token_balance || 0) + amounts.BET;
    }
    if (amounts.USDT && amounts.USDT > 0) {
      inc.cash_balance = (inc.cash_balance || 0) + amounts.USDT;
    }

    const updatedUser = Object.keys(inc).length
      ? await userService.updateUserData(id, { $inc: inc })
      : null;

    if (updatedUser) {
      if (amounts.BET && amounts.BET > 0) {
        await userService.recordBalanceChange(id, amounts.BET, 'Wager winnings', undefined, 'Wager');
      }
      if (amounts.USDT && amounts.USDT > 0) {
        await userService.recordBalanceChange(id, amounts.USDT, 'Wager winnings', undefined, 'Wager');
      }
    }
    return updatedUser;
  });

  const result = await Promise.all(updates);
  return result.filter((u): u is UserDoc => u !== null);
};

/**
 * Update `WagerDocs` with respect to their outcomes
 * @param wagerResults JSON mapping wager outcomes to an array of wagers IDs with that outcome
 * @param winningPoolShare For pool wagers, share of the pool that the winners get
 * @returns Array of updated `WagerDoc`
 */
const updateWagerResults = async (processedWagers: ProcessedWager[], wagerResults: WagerResults): Promise<WagerDoc[]> => {
  // Update resolved + status
  const outcomeUpdates = await Promise.all(
    Object.entries(wagerResults).map(async ([outcome, ids]) => {
      const updateQuery: UpdateQuery<WagerDoc> = { resolved: true, status: outcome as WagerOutcomes };
      const res = await wagerService.updateManyWagers({ _id: { $in: ids } }, updateQuery);
      return res && wagerService.getWagers({ _id: { $in: ids } });
    })
  );

  // Set winning_pool_share per winner group (by applied_share)
  const winners = processedWagers.filter(w => w.outcome === WagerStatus.WON && typeof w.applied_share === 'number');
  const byShare = winners.reduce((map, w) => {
    const key = String(w.applied_share);
    const arr = map[key] || [] as Types.ObjectId[];
    arr.push(w._id);
    map[key] = arr;
    return map;
  }, {} as Record<string, Types.ObjectId[]>);

  await Promise.all(Object.entries(byShare).map(([shareStr, ids]) => {
    const share = Number(shareStr);
    return wagerService.updateManyWagers({ _id: { $in: ids } }, { winning_pool_share: share });
  }));

  const updatedWagers = await Promise.all(outcomeUpdates);
  return updatedWagers.filter((w): w is WagerDoc[] => w !== null).flat();
};

/**
 * Resolve wagers based on outcome
 * @param wagers Array of `WagerDoc`
 * @param correctWager Outcome that wagers will be compared to
 * @param processWagers Function to process wagers, either `processWDLWagers` or `processCriticalMoveWagers`
 * @param correlationId Optional correlation ID for tracking related logs
 * @returns JSON mapping user IDs to their wagers
 */
const resolveWagers = async (wagers: WagerDoc[], correctWager: string, processWagers: WagerProcessor, correlationId?: string): Promise<UserWagers> => {
  const cid = correlationId || generateCorrelationId();
  const userCount = new Set(wagers.map(w => w.better_id)).size;

  // Only log if there are actual users affected (or verbose mode)
  if (userCount > 0 && verboseGameLogs) {
    logger.log({ level: 'debug', event: 'resolve_wagers_start', context: { cid, wagers: wagers.length, userCount } });
  }

  const { processedWagers } = processWagers(wagers, correctWager);

  const userWinnings = getUserWinnings(processedWagers);
  const wagerResults = getWagerResults(processedWagers);

  await updateUserWinnings(processedWagers);
  const updatedWagers = await updateWagerResults(processedWagers, wagerResults);

  if (userCount > 0) {
    logger.log({ level: 'info', event: 'resolve_wagers_complete', context: { cid, userCount } });
  } else if (verboseGameLogs) {
    logger.log({ level: 'debug', event: 'resolve_wagers_complete', context: { cid, userCount } });
  }

  return getUserWagers(updatedWagers);
};

/**
 * Get critical move wagers for provided `gameID` and resolve them based on outcome
 * @param gameId ID of game
 * @param chessGame chess from which outcome will be derived
 * @param topMoves Array of provided options to wager on, alongside `other` option
 * @returns JSON mapping user IDs to their wagers
 */
export const resolveCriticalMoveWagers = async (gameId: string, chessHistory: string[], topMoves: string[]): Promise<UserWagers> => {
  const correlationId = generateCorrelationId();
  const moveNum = chessHistory.length;
  const lastMove = chessHistory[chessHistory.length - 1];
  // The correct move is always the actual move played, regardless of predictions
  const correctMove = lastMove;

  if (verboseGameLogs) {
    logger.log({ level: 'debug', event: 'critical_move_resolution_start', context: { correlationId, gameId, moveNum, lastMove, topMoves } });
  }

  await delay(500); // ensures all wagers are present in database

  const wagers = await wagerService.getWagers({
    game_id: Types.ObjectId(gameId),
    wdl: false,
    move_number: moveNum,
    resolved: false,
  });

  return resolveWagers(wagers, correctMove, processCriticalMoveWagers, correlationId);
};

/**
 * Get win/draw/loss wagers for provided `gameID` and resolve them based on outcome
 * @param gameId ID of game
 * @param gameStatus outcome of game
 * @returns JSON mapping user IDs to their wagers
 */
export const resolveWdlWagers = async (gameId: string, gameStatus: string): Promise<UserWagers> => {
  const correlationId = generateCorrelationId();
  if (verboseGameLogs) {
    logger.log({ level: 'debug', event: 'wdl_resolution_start', context: { correlationId, gameId, gameStatus } });
  }

  await delay(500); // ensures all wagers are present in database

  const wagers = await wagerService.getWagers({
    game_id: Types.ObjectId(gameId),
    wdl: true,
    resolved: false,
  });

  return resolveWagers(wagers, gameStatus, processWDLWagers, correlationId);
};

/**
 * For when move options are not available. Get critical move wagers for provided `gameID` and cancel them all.
 * @param gameId ID of game
 * @param chessGame chess from which outcome will be derived
 * @returns JSON mapping user IDs to their wagers
 */
export const cancelCriticalMoveWagers = async (gameId: string, chessHistory: string[]): Promise<UserWagers> => {
  const correlationId = generateCorrelationId();
  const moveNum = chessHistory.length;
  if (verboseGameLogs) {
    logger.log({ level: 'debug', event: 'critical_move_cancel_all', context: { correlationId, gameId, moveNum } });
  }

  await delay(500); // ensures all wagers are present in database

  const wagers = await wagerService.getWagers({
    game_id: Types.ObjectId(gameId),
    wdl: false,
    move_number: moveNum,
    resolved: false,
  });

  return resolveWagers(wagers, 'no data', processCriticalMoveWagers, correlationId);
};
