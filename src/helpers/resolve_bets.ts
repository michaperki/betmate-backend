import { ChessInstance } from 'chess.js';
import { userController, wagerController } from 'controllers';
import { UpdateQuery } from 'mongoose';
import {
  UserDoc, WagerDoc, WagerOutcomes, WagerStatus,
} from 'types/models';
import {
  ProcessedWager, UserWagers, UserWinnings, WagerProcessor, WagerResults,
} from 'types/wagers';
import { delay } from './utils';

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

export const processWDLWagers: WagerProcessor = (wagers, correctOutcome) => ({
  processedWagers: wagers.map(processWager(correctOutcome)),
});

export const processCriticalMoveWagers: WagerProcessor = (wagers, correctMove) => {
  const totalPool = wagers
    .reduce((sum, w) => sum + w.amount, 0);
  const winningPool = wagers
    .filter((w) => w.data === correctMove)
    .reduce((sum, w) => sum + w.amount, 0);

  const winningPoolShare = totalPool / winningPool;
  const returnBets = winningPool === 0;

  return {
    processedWagers: wagers.map(processWager(correctMove, winningPoolShare, returnBets)),
    winningPoolShare,
  };
};

export const getUserWinnings = (pw: ProcessedWager[]): UserWinnings => (
  pw.reduce((uw, w) => {
    const userID = String(w.better_id);
    return {
      ...uw,
      [userID]: (uw[userID] || 0) + w.winnings,
    };
  }, {})
);

export const getUserWagers = (wagers: WagerDoc[]): UserWagers => (
  wagers.reduce((userWagers, w) => {
    const userID = String(w.better_id);
    return {
      ...userWagers,
      [userID]: [...(userWagers[userID] || []), w],
    };
  }, {})
);

export const getWagerResults = (pw: ProcessedWager[]): WagerResults => ({
  [WagerStatus.WON]: pw.filter((w) => w.outcome === WagerStatus.WON).map((w) => w._id),
  [WagerStatus.LOST]: pw.filter((w) => w.outcome === WagerStatus.LOST).map((w) => w._id),
  [WagerStatus.CANCELLED]: pw.filter((w) => w.outcome === WagerStatus.CANCELLED).map((w) => w._id),
});

const updateUserWinnings = async (userWinnings: UserWinnings): Promise<UserDoc[]> => {
  const usersToUpdate = Object
    .entries(userWinnings)
    .map(([id, winnings]) => (
      userController
        .updateUserData(id, { $inc: { account: winnings } })
    ));

  const updatedUsers = await Promise.all(usersToUpdate);
  return updatedUsers.filter((u): u is UserDoc => u !== null);
};

const updateWagerResults = async (wagerResults: WagerResults, winningPoolShare?: number): Promise<WagerDoc[]> => {
  const wagersToUpdate = Object
    .entries(wagerResults)
    .map(async ([outcome, ids]) => {
      const updateQuery: UpdateQuery<WagerDoc> = {
        resolved: true,
        status: outcome as WagerOutcomes,
        ...(winningPoolShare && { winning_pool_share: winningPoolShare }),
      };

      const res = await wagerController.updateManyWagers({ _id: { $in: ids } }, updateQuery);
      return res && wagerController.getWagers({ _id: { $in: ids } });
    });

  const updatedWagers = await Promise.all(wagersToUpdate);
  return updatedWagers.filter((w): w is WagerDoc[] => w !== null).flat();
};

const resolveWagers = async (wagers: WagerDoc[], correctWager: string, processWagers: WagerProcessor): Promise<UserWagers> => {
  const { processedWagers, winningPoolShare } = processWagers(wagers, correctWager);

  const userWinnings = getUserWinnings(processedWagers);
  const wagerResults = getWagerResults(processedWagers);

  updateUserWinnings(userWinnings);
  const updatedWagers = await updateWagerResults(wagerResults, winningPoolShare);
  return getUserWagers(updatedWagers);
};

export const resolveCriticalMoveWagers = async (gameId: string, chessGame: ChessInstance, topMoves: string[]): Promise<UserWagers | null> => {
  const moveNum = chessGame.history().length;
  const [lastMove] = chessGame.history().slice(-1);
  const correctMove = topMoves.includes(lastMove) ? lastMove : 'Other';

  await delay(500);

  const wagers = await wagerController.getWagers({
    game_id: gameId,
    wdl: false,
    move_number: moveNum,
    resolved: false,
  });

  return wagers && await resolveWagers(wagers, correctMove, processCriticalMoveWagers);
};

export const resolveWdlWagers = async (gameId: string, gameStatus: string): Promise<UserWagers | null> => {
  await delay(500);

  const wagers = await wagerController.getWagers({
    game_id: gameId,
    wdl: true,
    resolved: false,
  });

  return wagers && await resolveWagers(wagers, gameStatus, processWDLWagers);
};

export const cancelCriticalMoveWagers = async (gameId: string, chessGame: ChessInstance): Promise<UserWagers | null> => {
  const moveNum = chessGame.history().length;

  await delay(500);

  const wagers = await wagerController.getWagers({
    game_id: gameId,
    wdl: false,
    move_number: moveNum,
    resolved: false,
  });

  return wagers && await resolveWagers(wagers, 'no data', processCriticalMoveWagers);
};
