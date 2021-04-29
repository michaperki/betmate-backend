import { ChessInstance } from 'chess.js';
import { Users, Wager } from 'models';
import WagerModel from 'models/wager_model';
import { WagerDoc } from 'types/models';

export const getWagersByUserId = (wagers: WagerDoc[]): Record<string, string[]> => wagers.reduce((wagersById, currWager) => {
  const userId = String(currWager.better_id);
  return {
    ...wagersById,
    [userId]: [...(wagersById[userId] || []), currWager.id],
  };
}, {});

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

export const getWDLWinningsByUserId = (wagers: WagerDoc[], correctOutcome: string): Record<string, number> => wagers.reduce((winningsById, currWager) => {
  const userId = String(currWager.better_id);
  const winnings = currWager.data === correctOutcome
    ? currWager.odds * currWager.amount
    : 0;

  return {
    ...winningsById,
    [userId]: (winningsById[userId] || 0) + winnings,
  };
}, {});

export const resolveBets = async (winningsById: Record<string, number>, wagersById: Record<string, string[]>): Promise<WagerDoc[] | null> => {
  try {
    const wagerUpdates = (
      Object.keys(winningsById)
        .map(async (better_id) => {
          const winnings = winningsById[better_id];
          const wagerIds = wagersById[better_id];
          await Users.findByIdAndUpdate(better_id, { $inc: { account: winnings } });
          await Wager.updateMany({ _id: { $in: wagerIds } }, { resolved: true });
          return Wager.find(wagerIds);
        })
    );
    const resolvedWagersById = await Promise.all(wagerUpdates);
    return resolvedWagersById.flat(1);
  } catch (error) {
    return null;
  }
};

export const resolveCriticalMoveBets = async (gameId: string, chessGame: ChessInstance): Promise<WagerDoc[] | null> => {
  try {
    const moveNum = chessGame.history().length;
    const [lastMove] = chessGame.history().slice(-1);

    const wagers = await WagerModel.find({
      game_id: gameId,
      wdl: false,
      move_number: moveNum,
      resolved: false,
    });

    const winningsById = getCriticalMoveWinningsByUserId(wagers, lastMove);
    const wagersById = getWagersByUserId(wagers);

    return await resolveBets(winningsById, wagersById);
  } catch (error) {
    return null;
  }
};

export const resolveWdlBets = async (gameId: string, gameStatus: string): Promise<WagerDoc[] | null> => {
  try {
    const wagers = await WagerModel.find({
      game_id: gameId,
      wdl: true,
      resolved: false,
    });

    const winningsById = getWDLWinningsByUserId(wagers, gameStatus);
    const wagersById = getWagersByUserId(wagers);

    return await resolveBets(winningsById, wagersById);
  } catch (error) {
    return null;
  }
};
