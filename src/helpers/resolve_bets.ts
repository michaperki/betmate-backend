import { Users, Wager } from '../models';
import { WagerDoc } from '../types/models';

const getWagersByUserId = (wagers) => wagers.reduce((wagersById, currWager) => {
  const userId = currWager.better_id;
  const wagerId = currWager.id;
  let wagerIds = [wagerId];
  if (userId in wagersById) wagerIds = [...wagerIds, ...wagersById[userId]];
  return {
    ...wagersById,
    [userId]: wagerIds,
  };
}, {});

const getCriticalMoveWinningsByUserId = (wagers, correctMove) => {
  let totalPool = 0;
  let winningPool = 0;
  wagers.forEach((wager) => {
    // wager.data is assumed to always be in SAN notation
    if (wager.data === correctMove) winningPool += wager.amount;
    totalPool += wager.amount;
  });

  return wagers.reduce((winningsById, currWager) => {
    let winnings = 0;
    const userId = currWager.better_id;
    if (currWager.data === correctMove) winnings = (currWager.amount / winningPool) * totalPool;
    if (userId in winningsById) winnings += winningsById[userId];
    return {
      ...winningsById,
      [userId]: winnings,
    };
  }, {});
};

const getWDLWinningsByUserId = (wagers, correctOutcome) => wagers.reduce((winningsById, currWager) => {
  const { odds } = currWager;
  const userId = currWager.better_id;
  const wonBet = currWager.data === correctOutcome;
  let winnings = 0;
  // using decimal notation for odds
  if (wonBet) winnings = odds * currWager.amount;
  if (userId in winningsById) winnings += winningsById[userId];
  return {
    ...winningsById,
    [userId]: winnings,
  };
}, {});

const resolveBets = (winningsById, wagersById) => {
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
