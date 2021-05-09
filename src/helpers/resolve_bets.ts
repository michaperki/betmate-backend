/* eslint-disable no-nested-ternary */
import { ChessInstance } from 'chess.js';
import { userController, wagerController } from 'controllers';
import {
  WagerDoc, WagerStatus,
} from 'types/models';
import {
  ProcessedWager, WagerProcesser as WagerProcessor,
} from 'types/wagers';

export const processWager = (correctMove: string, wps = 1, returnWagers = false) => (
  (w: WagerDoc): ProcessedWager => {
    const odds = w.wdl ? w.odds : wps;
    const baseWager = { _id: w._id, better_id: w.better_id };
    switch (true) {
      case returnWagers:
        return {
          ...baseWager,
          winnings: w.amount,
          outcome: WagerStatus.CANCELLED,
        };
      case w.data === correctMove:
        return {
          ...baseWager,
          winnings: w.amount * odds,
          outcome: WagerStatus.WON,
        };
      default:
        return {
          ...baseWager,
          winnings: 0,
          outcome: WagerStatus.LOST,
        };
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

  return wagers.map(processWager(correctMove, winningPoolShare, winningPool === 0));
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
