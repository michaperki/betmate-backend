import { Users, Wager } from 'models';
import { WagerDoc } from 'types/models';

export const resolveCriticalMoveBets = async (wagers: WagerDoc[], lastMove: string): Promise<(WagerDoc|null)[]> => {
  let totalPool = 0;
  let winningPool = 0;
  wagers.forEach((wager) => {
    // wager.data is assumed to always be in SAN notation
    if (wager.data === lastMove) winningPool += wager.amount;
    totalPool += wager.amount;
  });

  const moveWagerUpdates = (
    wagers
      .map((wager) => {
        let winnings = 0;
        if (wager.data === lastMove) winnings = (wager.amount / winningPool) * totalPool;
        return Users
          .findByIdAndUpdate(wager.better_id, { $inc: { account: winnings } })
          .then(() => Wager.findByIdAndUpdate(wager.id, { resolved: true }));
      })
  );

  return Promise.all(moveWagerUpdates);
};

export const resolveWdlBets = async (wagers: WagerDoc[], gameStatus: string): Promise<(WagerDoc|null)[]> => {
  const wdlWagerUpdates = wagers.map((wager) => {
    const { odds } = wager;
    const wonBet = wager.data === gameStatus;
    let winnings = 0;
    // using decimal notation for odds
    if (wonBet) winnings = odds * wager.amount;

    return (
      Users
        .findByIdAndUpdate(wager.better_id, { $inc: { account: winnings } })
        .then(() => Wager.findByIdAndUpdate(wager.id, { resolved: true }))
    );
  });

  return Promise.all(wdlWagerUpdates);
};
