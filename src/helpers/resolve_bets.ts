import { UpdateQuery, Types } from 'mongoose';
import { userService, wagerService } from '../services';
import { UserDoc } from '../types/models/user';
import {
  ProcessedWager, UserWagers, UserWinnings, WagerDoc, WagerOutcomes, WagerProcessor, WagerResults, WagerStatus,
} from '../types/models/wager';

import { delay, generateCorrelationId } from './utils';
import { logDebug } from './dev_logger';

/**
 * Construct function to process `WagerDoc` into `ProcessedWager`
 * @param correctWager Outcome that wagers will be compared to
 * @param winningPoolShare For pool betting, determined odds for winners of pool
 * @param returnWagers For pool betting, for when no one wins pool
 */
export const processWager = (correctWager: string, winningPoolShare = 1, returnWagers = false) => (
  (wager: WagerDoc): ProcessedWager => {
    const baseWager = { _id: wager._id, better_id: wager.better_id };
    const odds = wager.wdl ? wager.odds : winningPoolShare;

    switch (true) {
      case returnWagers:
        return { ...baseWager, outcome: WagerStatus.CANCELLED, winnings: wager.amount };
      case wager.data === correctWager:
        return { ...baseWager, outcome: WagerStatus.WON, winnings: wager.amount * odds };
      default:
        return { ...baseWager, outcome: WagerStatus.LOST, winnings: 0 };
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
  processedWagers: wagers.map(processWager(correctOutcome)),
});

/**
 * Process pool `wagers` based on correct outcome
 * @param wagers made on outcome
 * @param correctOutcome determines which wagers win
 * @returns Processed `wagers`, and share of the pool that the winners get
 */
export const processCriticalMoveWagers: WagerProcessor = (wagers, correctMove) => {
  const totalPool = wagers
    .reduce((sum, w) => sum + w.amount, 0);
  const winningPool = wagers
    .filter((w) => w.data === correctMove)
    .reduce((sum, w) => sum + w.amount, 0);

  const returnBets = winningPool === 0;
  const winningPoolShare = returnBets
    ? Number.MAX_SAFE_INTEGER
    : totalPool / winningPool;

  return {
    processedWagers: wagers.map(processWager(correctMove, winningPoolShare, returnBets)),
    winningPoolShare,
  };
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
export const getWagerResults = (pw: ProcessedWager[]): WagerResults => ({
  [WagerStatus.WON]: pw.filter((w) => w.outcome === WagerStatus.WON).map((w) => w._id),
  [WagerStatus.LOST]: pw.filter((w) => w.outcome === WagerStatus.LOST).map((w) => w._id),
  [WagerStatus.CANCELLED]: pw.filter((w) => w.outcome === WagerStatus.CANCELLED).map((w) => w._id),
});

/**
 * Update `User` accounts with their winnings
 * @param userWinnings JSON mapping user IDs to their wagers
 * @returns Array of updated `UserDoc`
 */
const updateUserWinnings = async (userWinnings: UserWinnings): Promise<UserDoc[]> => {
  const usersToUpdate = Object
    .entries(userWinnings)
    .map(async ([id, winnings]) => {
      // Update user account
      const updatedUser = await userService.updateUserData(id, { $inc: { account: winnings } });

      // Record balance history
      if (updatedUser && winnings > 0) {
        await userService.recordBalanceChange(
          id,
          winnings,
          'Wager winnings',
          undefined,
          'Wager'
        );
      }

      return updatedUser;
    });

  const updatedUsers = await Promise.all(usersToUpdate);
  return updatedUsers.filter((u): u is UserDoc => u !== null);
};

/**
 * Update `WagerDocs` with respect to their outcomes
 * @param wagerResults JSON mapping wager outcomes to an array of wagers IDs with that outcome
 * @param winningPoolShare For pool wagers, share of the pool that the winners get
 * @returns Array of updated `WagerDoc`
 */
const updateWagerResults = async (wagerResults: WagerResults, winningPoolShare?: number): Promise<WagerDoc[]> => {
  const wagersToUpdate = Object
    .entries(wagerResults)
    .map(async ([outcome, ids]) => {
      const updateQuery: UpdateQuery<WagerDoc> = {
        resolved: true,
        status: outcome as WagerOutcomes,
        ...(winningPoolShare && { winning_pool_share: winningPoolShare }),
      };

      const res = await wagerService.updateManyWagers({ _id: { $in: ids } }, updateQuery);
      return res && wagerService.getWagers({ _id: { $in: ids } });
    });

  const updatedWagers = await Promise.all(wagersToUpdate);
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

  // Only log if there are actual users affected
  if (userCount > 0) {
    logDebug(`[${cid}] Resolving ${wagers.length} wagers for ${userCount} users`);
  }

  const { processedWagers, winningPoolShare } = processWagers(wagers, correctWager);

  const userWinnings = getUserWinnings(processedWagers);
  const wagerResults = getWagerResults(processedWagers);

  updateUserWinnings(userWinnings);
  const updatedWagers = await updateWagerResults(wagerResults, winningPoolShare);

  if (userCount > 0) {
    logDebug(`[${cid}] Resolution complete: ${userCount} users affected`);
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

  logDebug(`[${correlationId}] Starting critical move resolution for game ${gameId}, move ${moveNum}`);
  logDebug(`[${correlationId}] Actual move played: "${lastMove}", Top moves were: [${topMoves.join(', ')}]`);

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
  logDebug(`[${correlationId}] Starting WDL resolution for game ${gameId} with outcome: ${gameStatus}`);

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

  logDebug(`[${correlationId}] Cancelling critical move wagers for game ${gameId}, move ${moveNum}`);

  await delay(500); // ensures all wagers are present in database

  const wagers = await wagerService.getWagers({
    game_id: Types.ObjectId(gameId),
    wdl: false,
    move_number: moveNum,
    resolved: false,
  });

  return resolveWagers(wagers, 'no data', processCriticalMoveWagers, correlationId);
};
