import { ChessInstance } from 'chess.js';
import { userController, wagerController } from 'controllers';
import {
  UserDoc, WagerDoc, WagerOutcomes, WagerStatus,
} from 'types/models';

export const getWagerOutcomes = (wagers: WagerDoc[], correctMove: string): Record<WagerOutcomes, string[]> => ({
  [WagerStatus.WON]: wagers.filter((w) => w.data === correctMove).map((w) => String(w._id)),
  [WagerStatus.LOST]: wagers.filter((w) => w.data !== correctMove).map((w) => String(w._id)),
});

export const getCriticalMoveWinningsByUserId = (wagers: WagerDoc[], correctMove: string): Record<string, number> => {
  let totalPool = 0;
  let winningPool = 0;
  wagers.forEach((wager) => {
    // wager.data is assumed to always be in SAN notation
    if (wager.data === correctMove) winningPool += wager.amount;
    totalPool += wager.amount;
  });

  if (winningPool === 0) {
    return wagers.reduce((refundsById, currWager) => {
      const userId = String(currWager.better_id);
      return {
        ...refundsById,
        [userId]: (refundsById[userId] || 0) + currWager.amount,
      };
    }, {});
  }

  return wagers.reduce((winningsById, currWager) => {
    const userId = String(currWager.better_id);
    const winnings = currWager.data === correctMove
      ? (currWager.amount / winningPool) * totalPool
      : 0;

    return {
      ...winningsById,
      [userId]: (winningsById[userId] || 0) + winnings,
    };
  }, {});
};

export const getWDLWinningsByUserId = (wagers: WagerDoc[], correctOutcome: string): Record<string, number> => (
  wagers.reduce((winningsById, currWager) => {
    const userId = String(currWager.better_id);
    const winnings = currWager.data === correctOutcome
      ? currWager.odds * currWager.amount
      : 0;

    return {
      ...winningsById,
      [userId]: (winningsById[userId] || 0) + winnings,
    };
  }, {}));

export const resolveBets = async (wagerOutcomes: Record<WagerOutcomes, string[]>): Promise<WagerDoc[] | null> => {
  try {
    const wagersToResolve = (
      Object
        .entries(wagerOutcomes)
        .map(([outcome, ids]) => (
          wagerController
            .updateManyWagers({ _id: { $in: ids } }, { resolved: true, status: outcome as WagerStatus })
            .then(() => wagerController.getWagers({ _id: { $in: ids } }))
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

    if (!wagers) throw Error('Get wagers failed');

    const userWinnings = getCriticalMoveWinningsByUserId(wagers, lastMove);
    const wagerOutcomes = getWagerOutcomes(wagers, lastMove);

    updateUserAccounts(userWinnings);
    return await resolveBets(wagerOutcomes);
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

    if (!wagers) throw Error('Get wagers failed');

    const userWinnings = getWDLWinningsByUserId(wagers, gameStatus);
    const wagerOutcomes = getWagerOutcomes(wagers, gameStatus);

    updateUserAccounts(userWinnings);
    return await resolveBets(wagerOutcomes);
  } catch (error) {
    return null;
  }
};
