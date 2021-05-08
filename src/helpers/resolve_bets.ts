/* eslint-disable no-nested-ternary */
import { ChessInstance } from 'chess.js';
import { userController, wagerController } from 'controllers';
import {
  UserDoc, WagerDoc, WagerOutcomes, WagerStatus,
} from 'types/models';
import { WinningsFn } from 'types/wagers';

export const getWagerOutcomes = (wagers: WagerDoc[], correctOutcome: string): Record<WagerOutcomes, string[]> => ({
  [WagerStatus.WON]: wagers.filter((w) => w.data === correctOutcome).map((w) => String(w._id)),
  [WagerStatus.LOST]: wagers.filter((w) => w.data !== correctOutcome).map((w) => String(w._id)),
});

const reduceWagersToWinnings = (correctWager: string, poolShare = 1, returnWagers = false) => (
  (winningsByUser: Record<string, number>, currWager: WagerDoc): Record<string, number> => {
    const userId = String(currWager.better_id);
    const odds = currWager.wdl ? currWager.odds : 1;
    const winnings = returnWagers ? currWager.amount
      : currWager.data === correctWager ? currWager.amount * odds * poolShare
        : 0;

    return {
      ...winningsByUser,
      [userId]: (winningsByUser[userId] || 0) + winnings,
    };
  }
);

export const getCriticalMoveWinningsByUser = (wagers: WagerDoc[], correctMove: string): Record<string, number> => {
  const totalPool = wagers
    .reduce((sum, w) => sum + w.amount, 0);
  const winningPool = wagers
    .filter((w) => w.data === correctMove)
    .reduce((sum, w) => sum + w.amount, 0);

  const winningPoolShare = totalPool / winningPool;
  const returnWagers = winningPool === 0;

  return wagers.reduce(reduceWagersToWinnings(correctMove, winningPoolShare, returnWagers), {});
};

export const getWDLWinningsByUser = (wagers: WagerDoc[], correctOutcome: string): Record<string, number> => (
  wagers.reduce(reduceWagersToWinnings(correctOutcome), {})
);

export const updateResolvedWagers = async (wagerOutcomes: Record<WagerOutcomes, string[]>): Promise<WagerDoc[] | null> => {
  try {
    const wagersToResolve = (
      Object
        .entries(wagerOutcomes)
        .map(([outcome, ids]) => (
          wagerController
            .updateManyWagers({ _id: { $in: ids } }, { resolved: true, status: outcome as WagerStatus })
            .then((res) => res && wagerController.getWagers({ _id: { $in: ids } }))
        ))
    );

    const resolvedWagers = await Promise.all(wagersToResolve);
    return resolvedWagers.filter((ws): ws is WagerDoc[] => ws !== null).flat();
  } catch (error) {
    return null;
  }
};

export const updateUserAccounts = async (userWinnings: Record<string, number>): Promise<UserDoc[] | null> => {
  try {
    const updatedUsers = (
      Object
        .entries(userWinnings)
        .map(([id, winnings]) => (
          userController.updateUserData(id, { $inc: { account: winnings } })
        ))
    );

    const resolvedUsers = await Promise.all(updatedUsers);
    return resolvedUsers.filter((u): u is UserDoc => u !== null);
  } catch (error) {
    return null;
  }
};

export const resolveWagers = async (wagers: WagerDoc[], correctMove: string, getWinnings: WinningsFn): Promise<WagerDoc[] | null> => {
  try {
    const userWinnings = getWinnings(wagers, correctMove);
    const wagerOutcomes = getWagerOutcomes(wagers, correctMove);

    updateUserAccounts(userWinnings);
    return await updateResolvedWagers(wagerOutcomes);
  } catch (error) {
    return null;
  }
};

export const resolveCriticalMoveBets = async (gameId: string, chessGame: ChessInstance): Promise<WagerDoc[] | null> => {
  try {
    const moveNum = chessGame.history().length;
    const [lastMove] = chessGame.history().slice(-1);

    const wagers = await wagerController.getWagers({
      game_id: gameId,
      wdl: false,
      move_number: moveNum,
      resolved: false,
    });

    return wagers && await resolveWagers(wagers, lastMove, getCriticalMoveWinningsByUser);
  } catch (error) {
    return null;
  }
};

export const resolveWdlBets = async (gameId: string, gameStatus: string): Promise<WagerDoc[] | null> => {
  try {
    const wagers = await wagerController.getWagers({
      game_id: gameId,
      wdl: true,
      resolved: false,
    });

    return wagers && await resolveWagers(wagers, gameStatus, getWDLWinningsByUser);
  } catch (error) {
    return null;
  }
};
