import { ChessInstance } from 'chess.js';
import { userController, wagerController } from 'controllers';
import { WagerDoc, WagerStatus } from 'types/models';
import { ProcessedWager, WagerProcessor } from 'types/wagers';

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

export const processWDLWagers: WagerProcessor = (wagers, correctOutcome) => (
  wagers.map(processWager(correctOutcome))
);

export const processCriticalMoveWagers: WagerProcessor = (wagers, correctMove) => {
  const totalPool = wagers
    .reduce((sum, w) => sum + w.amount, 0);
  const winningPool = wagers
    .filter((w) => w.data === correctMove)
    .reduce((sum, w) => sum + w.amount, 0);

  const winningPoolShare = totalPool / winningPool;
  const returnBets = winningPool === 0;

  return wagers.map(processWager(correctMove, winningPoolShare, returnBets));
};

const resolveWagers = async (wagers: WagerDoc[], correctWager: string, processWagers: WagerProcessor): Promise<WagerDoc[]> => {
  const processedWagers: ProcessedWager[] = processWagers(wagers, correctWager);

  const wagersToResolve = processedWagers.map((pw) => (
    userController
      .updateUserData(pw.better_id, { $inc: { account: pw.winnings } })
      .then((res) => res && wagerController.updateWager(pw._id, { resolved: true, winnings: pw.winnings, status: pw.outcome }))
  ));

  const resolvedWagers = await Promise.all(wagersToResolve);
  return resolvedWagers.filter((w): w is WagerDoc => w !== null);
};

export const resolveCriticalMoveWagers = async (gameId: string, chessGame: ChessInstance): Promise<WagerDoc[] | null> => {
  try {
    const moveNum = chessGame.history().length;
    const [lastMove] = chessGame.history().slice(-1);

    const wagers = await wagerController.getWagers({
      game_id: gameId,
      wdl: false,
      move_number: moveNum,
      resolved: false,
    });

    return wagers && await resolveWagers(wagers, lastMove, processCriticalMoveWagers);
  } catch (error) {
    return null;
  }
};

export const resolveWdlWagers = async (gameId: string, gameStatus: string): Promise<WagerDoc[] | null> => {
  try {
    const wagers = await wagerController.getWagers({
      game_id: gameId,
      wdl: true,
      resolved: false,
    });

    return wagers && await resolveWagers(wagers, gameStatus, processWDLWagers);
  } catch (error) {
    return null;
  }
};
