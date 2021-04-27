import { Users, Wager } from '../models';
import { WagerDoc } from '../types/models';

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

export const resolveBets = (winningsById: Record<string, number>, wagersById: Record<string, string[]>): Promise<(WagerDoc|null)[]> => {
  const wagerUpdates = (
    Object.keys(winningsById)
      .map((better_id) => {
        const winnings = winningsById[better_id];
        const wagerIds = wagersById[better_id];
        return Users
          .findByIdAndUpdate(better_id, { $inc: { account: winnings } })
          .then(() => Wager.updateMany({ _id: { $in: wagerIds } }, { resolved: true }));
      })
  );
  return Promise.all(wagerUpdates);
};

export const resolveCriticalMoveBets = async (wagers: WagerDoc[], lastMove: string): Promise<(WagerDoc|null)[]> => {
  const winningsById = getCriticalMoveWinningsByUserId(wagers, lastMove);
  const wagersById = getWagersByUserId(wagers);

  return resolveBets(winningsById, wagersById);
};

export const resolveWdlBets = async (wagers: WagerDoc[], gameStatus: string): Promise<(WagerDoc|null)[]> => {
  const winningsById = getWDLWinningsByUserId(wagers, gameStatus);
  const wagersById = getWagersByUserId(wagers);

  return resolveBets(winningsById, wagersById);
};
