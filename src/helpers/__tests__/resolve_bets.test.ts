import mongoose, { Types } from 'mongoose';
import { Wager } from 'models';
import { GameStatus, WagerStatus, WagerDoc } from 'types/models';
import { ProcessedWager } from 'types/wagers';
import { processWager, processCriticalMoveWagers, processWDLWagers } from '../resolve_bets';

const gameId = new mongoose.Types.ObjectId();
const player1Id = new mongoose.Types.ObjectId();
const player2Id = new mongoose.Types.ObjectId();
const player3Id = new mongoose.Types.ObjectId();
const player4Id = new mongoose.Types.ObjectId();

const wdlWager0 = new Wager({
  game_id: gameId,
  better_id: player1Id,
  wdl: true,
  amount: 50,
  odds: 1.5,
  data: GameStatus.WHITE_WIN,
  move_number: 1,
});

const wdlWager1 = new Wager({
  game_id: gameId,
  better_id: player1Id,
  wdl: true,
  amount: 100,
  odds: 1.5,
  data: GameStatus.WHITE_WIN,
  move_number: 1,
});

const wdlWager2 = new Wager({
  game_id: gameId,
  better_id: player1Id,
  wdl: true,
  amount: 50,
  odds: 2.5,
  data: GameStatus.BLACK_WIN,
  move_number: 1,
});

const wdlWager3 = new Wager({
  game_id: gameId,
  better_id: player2Id,
  wdl: true,
  amount: 200,
  odds: 1.5,
  data: GameStatus.WHITE_WIN,
  move_number: 1,
});

const wdlWager4 = new Wager({
  game_id: gameId,
  better_id: player3Id,
  wdl: true,
  amount: 75,
  odds: 3,
  data: GameStatus.DRAW,
  move_number: 1,
});

const wdlWager5 = new Wager({
  game_id: gameId,
  better_id: player4Id,
  wdl: true,
  amount: 100,
  odds: 2.5,
  data: GameStatus.BLACK_WIN,
  move_number: 1,
});

const wdlWager6 = new Wager({
  game_id: gameId,
  better_id: player4Id,
  wdl: true,
  amount: 100,
  odds: 3,
  data: GameStatus.DRAW,
  move_number: 1,
});

const wdlWagers = [wdlWager0, wdlWager1, wdlWager2, wdlWager3, wdlWager4, wdlWager5, wdlWager6];

const moveWager0 = new Wager({
  game_id: gameId,
  better_id: player1Id,
  wdl: false,
  amount: 50,
  data: 'e4',
  move_number: 1,
});

const moveWager1 = new Wager({
  game_id: gameId,
  better_id: player1Id,
  wdl: false,
  amount: 50,
  data: 'd4',
  move_number: 1,
});

const moveWager2 = new Wager({
  game_id: gameId,
  better_id: player1Id,
  wdl: false,
  amount: 25,
  data: 'e4',
  move_number: 1,
});

const moveWager3 = new Wager({
  game_id: gameId,
  better_id: player2Id,
  wdl: false,
  amount: 25,
  data: 'e4',
  move_number: 1,
});

const moveWager4 = new Wager({
  game_id: gameId,
  better_id: player3Id,
  wdl: false,
  amount: 75,
  data: 'Nc3',
  move_number: 1,
});

const moveWager5 = new Wager({
  game_id: gameId,
  better_id: player4Id,
  wdl: false,
  amount: 100,
  data: 'Nc3',
  move_number: 1,
});

const moveWager6 = new Wager({
  game_id: gameId,
  better_id: player4Id,
  wdl: false,
  amount: 95,
  data: 'Nf3',
  move_number: 1,
});
// 420
const moveWagers = [moveWager0, moveWager1, moveWager2, moveWager3, moveWager4, moveWager5, moveWager6];

const testProcessWager = (wagerProcessor: (w: WagerDoc) => ProcessedWager, wager: WagerDoc, expOutcome: string, expWinnings: number) => {
  const processedWager = wagerProcessor(wager);
  expect(processedWager).toEqual({
    _id: wager._id,
    better_id: wager.better_id,
    outcome: expOutcome,
    winnings: expWinnings,
  });
};

const getWagerIDs = (w: WagerDoc): { _id: Types.ObjectId, better_id: Types.ObjectId } => ({ _id: w._id, better_id: w.better_id });

describe('Bet resolution logic', () => {
  describe('Working processWager', () => {
    describe('For WDL bets', () => {
      it('Handles white win', () => {
        const processWhiteWin = processWager(GameStatus.WHITE_WIN);
        testProcessWager(processWhiteWin, wdlWager0, WagerStatus.WON, 75);
        testProcessWager(processWhiteWin, wdlWager1, WagerStatus.WON, 150);
        testProcessWager(processWhiteWin, wdlWager2, WagerStatus.LOST, 0);
        testProcessWager(processWhiteWin, wdlWager4, WagerStatus.LOST, 0);
      });

      it('Handles black win', () => {
        const processBlackWin = processWager(GameStatus.BLACK_WIN);
        testProcessWager(processBlackWin, wdlWager2, WagerStatus.WON, 125);
        testProcessWager(processBlackWin, wdlWager5, WagerStatus.WON, 250);
        testProcessWager(processBlackWin, wdlWager0, WagerStatus.LOST, 0);
        testProcessWager(processBlackWin, wdlWager6, WagerStatus.LOST, 0);
      });

      it('Handles draw', () => {
        const processDraw = processWager(GameStatus.DRAW);
        testProcessWager(processDraw, wdlWager4, WagerStatus.WON, 225);
        testProcessWager(processDraw, wdlWager6, WagerStatus.WON, 300);
        testProcessWager(processDraw, wdlWager1, WagerStatus.LOST, 0);
        testProcessWager(processDraw, wdlWager2, WagerStatus.LOST, 0);
      });
    });

    describe('For move bets', () => {
      it('With winners 1', () => {
        const processMoveE4 = processWager('e4', 2.5);
        testProcessWager(processMoveE4, moveWager0, WagerStatus.WON, 125);
        testProcessWager(processMoveE4, moveWager2, WagerStatus.WON, 62.5);
        testProcessWager(processMoveE4, moveWager1, WagerStatus.LOST, 0);
        testProcessWager(processMoveE4, moveWager4, WagerStatus.LOST, 0);
      });

      it('With winners 2', () => {
        const processMoveD4 = processWager('d4', 4.25);
        testProcessWager(processMoveD4, moveWager1, WagerStatus.WON, 212.5);
        testProcessWager(processMoveD4, moveWager0, WagerStatus.LOST, 0);
        testProcessWager(processMoveD4, moveWager5, WagerStatus.LOST, 0);
      });

      it('With winners 3', () => {
        const processMoveNc3 = processWager('Nc3', 1.6);
        testProcessWager(processMoveNc3, moveWager4, WagerStatus.WON, 120);
        testProcessWager(processMoveNc3, moveWager5, WagerStatus.WON, 160);
        testProcessWager(processMoveNc3, moveWager2, WagerStatus.LOST, 0);
        testProcessWager(processMoveNc3, moveWager6, WagerStatus.LOST, 0);
      });

      it('With winners 4', () => {
        const processMoveNf3 = processWager('Nf3', 6.2);
        testProcessWager(processMoveNf3, moveWager6, WagerStatus.WON, 589);
        testProcessWager(processMoveNf3, moveWager3, WagerStatus.LOST, 0);
        testProcessWager(processMoveNf3, moveWager5, WagerStatus.LOST, 0);
      });

      it('No winners (return wagers', () => {
        const processMoveBc8 = processWager('Bc8', 6.2, true);
        testProcessWager(processMoveBc8, moveWager0, WagerStatus.CANCELLED, 50);
        testProcessWager(processMoveBc8, moveWager1, WagerStatus.CANCELLED, 50);
        testProcessWager(processMoveBc8, moveWager2, WagerStatus.CANCELLED, 25);
        testProcessWager(processMoveBc8, moveWager3, WagerStatus.CANCELLED, 25);
        testProcessWager(processMoveBc8, moveWager4, WagerStatus.CANCELLED, 75);
        testProcessWager(processMoveBc8, moveWager5, WagerStatus.CANCELLED, 100);
        testProcessWager(processMoveBc8, moveWager6, WagerStatus.CANCELLED, 95);
      });
    });
  });

  describe('Working processWDLWagers', () => {
    it('Handles white win', () => {
      const processedWagers = processWDLWagers(wdlWagers, GameStatus.WHITE_WIN);
      const expectedWagers: ProcessedWager[] = [
        { ...getWagerIDs(wdlWager0), outcome: WagerStatus.WON, winnings: 75 },
        { ...getWagerIDs(wdlWager1), outcome: WagerStatus.WON, winnings: 150 },
        { ...getWagerIDs(wdlWager2), outcome: WagerStatus.LOST, winnings: 0 },
        { ...getWagerIDs(wdlWager3), outcome: WagerStatus.WON, winnings: 300 },
        { ...getWagerIDs(wdlWager4), outcome: WagerStatus.LOST, winnings: 0 },
        { ...getWagerIDs(wdlWager5), outcome: WagerStatus.LOST, winnings: 0 },
        { ...getWagerIDs(wdlWager6), outcome: WagerStatus.LOST, winnings: 0 },
      ];

      processedWagers.forEach((pw, i) => expect(pw).toEqual(expectedWagers[i]));
    });

    it('Handles black win', () => {
      const processedWagers = processWDLWagers(wdlWagers, GameStatus.BLACK_WIN);
      const expectedWagers: ProcessedWager[] = [
        { ...getWagerIDs(wdlWager0), outcome: WagerStatus.LOST, winnings: 0 },
        { ...getWagerIDs(wdlWager1), outcome: WagerStatus.LOST, winnings: 0 },
        { ...getWagerIDs(wdlWager2), outcome: WagerStatus.WON, winnings: 125 },
        { ...getWagerIDs(wdlWager3), outcome: WagerStatus.LOST, winnings: 0 },
        { ...getWagerIDs(wdlWager4), outcome: WagerStatus.LOST, winnings: 0 },
        { ...getWagerIDs(wdlWager5), outcome: WagerStatus.WON, winnings: 250 },
        { ...getWagerIDs(wdlWager6), outcome: WagerStatus.LOST, winnings: 0 },
      ];

      processedWagers.forEach((pw, i) => expect(pw).toEqual(expectedWagers[i]));
    });

    it('Handles draw', () => {
      const processedWagers = processWDLWagers(wdlWagers, GameStatus.DRAW);
      const expectedWagers: ProcessedWager[] = [
        { ...getWagerIDs(wdlWager0), outcome: WagerStatus.LOST, winnings: 0 },
        { ...getWagerIDs(wdlWager1), outcome: WagerStatus.LOST, winnings: 0 },
        { ...getWagerIDs(wdlWager2), outcome: WagerStatus.LOST, winnings: 0 },
        { ...getWagerIDs(wdlWager3), outcome: WagerStatus.LOST, winnings: 0 },
        { ...getWagerIDs(wdlWager4), outcome: WagerStatus.WON, winnings: 225 },
        { ...getWagerIDs(wdlWager5), outcome: WagerStatus.LOST, winnings: 0 },
        { ...getWagerIDs(wdlWager6), outcome: WagerStatus.WON, winnings: 300 },
      ];

      processedWagers.forEach((pw, i) => expect(pw).toEqual(expectedWagers[i]));
    });

    it('Handles no winners', () => {
      const processedWagers = processWDLWagers(wdlWagers, 'UNEXPECTED_OUTCOME');
      const expectedWagers: ProcessedWager[] = [
        { ...getWagerIDs(wdlWager0), outcome: WagerStatus.LOST, winnings: 0 },
        { ...getWagerIDs(wdlWager1), outcome: WagerStatus.LOST, winnings: 0 },
        { ...getWagerIDs(wdlWager2), outcome: WagerStatus.LOST, winnings: 0 },
        { ...getWagerIDs(wdlWager3), outcome: WagerStatus.LOST, winnings: 0 },
        { ...getWagerIDs(wdlWager4), outcome: WagerStatus.LOST, winnings: 0 },
        { ...getWagerIDs(wdlWager5), outcome: WagerStatus.LOST, winnings: 0 },
        { ...getWagerIDs(wdlWager6), outcome: WagerStatus.LOST, winnings: 0 },
      ];

      processedWagers.forEach((pw, i) => expect(pw).toEqual(expectedWagers[i]));
    });

    it('Handles no wager data', () => {
      const processedWagers = processWDLWagers([], GameStatus.WHITE_WIN);
      expect(processedWagers).toEqual([]);
    });
  });

  describe('Working processCriticalMoveWagers', () => {
    describe('Multiperson pool', () => {
      it('With winners 1', () => {
        const processedWagers = processCriticalMoveWagers(moveWagers, 'e4');
        // $420 in pool, $100/$420 placed on the correct move
        const expectedWagers = [
          { ...getWagerIDs(moveWager0), outcome: WagerStatus.WON, winnings: 210 },
          { ...getWagerIDs(moveWager1), outcome: WagerStatus.LOST, winnings: 0 },
          { ...getWagerIDs(moveWager2), outcome: WagerStatus.WON, winnings: 105 },
          { ...getWagerIDs(moveWager3), outcome: WagerStatus.WON, winnings: 105 },
          { ...getWagerIDs(moveWager4), outcome: WagerStatus.LOST, winnings: 0 },
          { ...getWagerIDs(moveWager5), outcome: WagerStatus.LOST, winnings: 0 },
          { ...getWagerIDs(moveWager6), outcome: WagerStatus.LOST, winnings: 0 },
        ].map((pw) => ({ ...pw, winning_pool_share: 4.2 }));

        processedWagers.forEach((pw, i) => expect(pw).toEqual(expectedWagers[i]));
      });

      it('With winners 2', () => {
        const processedWagers = processCriticalMoveWagers(moveWagers, 'd4');
        // $420 in pool, $50/$420 placed on the correct move
        const expectedWagers = [
          { ...getWagerIDs(moveWager0), outcome: WagerStatus.LOST, winnings: 0 },
          { ...getWagerIDs(moveWager1), outcome: WagerStatus.WON, winnings: 420 },
          { ...getWagerIDs(moveWager2), outcome: WagerStatus.LOST, winnings: 0 },
          { ...getWagerIDs(moveWager3), outcome: WagerStatus.LOST, winnings: 0 },
          { ...getWagerIDs(moveWager4), outcome: WagerStatus.LOST, winnings: 0 },
          { ...getWagerIDs(moveWager5), outcome: WagerStatus.LOST, winnings: 0 },
          { ...getWagerIDs(moveWager6), outcome: WagerStatus.LOST, winnings: 0 },
        ].map((pw) => ({ ...pw, winning_pool_share: 8.4 }));

        processedWagers.forEach((pw, i) => expect(pw).toEqual(expectedWagers[i]));
      });

      it('With winners 3', () => {
        const processedWagers = processCriticalMoveWagers(moveWagers, 'Nc3');
        // $420 in pool, $175/$420 placed on the correct move
        const expectedWagers = [
          { ...getWagerIDs(moveWager0), outcome: WagerStatus.LOST, winnings: 0 },
          { ...getWagerIDs(moveWager1), outcome: WagerStatus.LOST, winnings: 0 },
          { ...getWagerIDs(moveWager2), outcome: WagerStatus.LOST, winnings: 0 },
          { ...getWagerIDs(moveWager3), outcome: WagerStatus.LOST, winnings: 0 },
          { ...getWagerIDs(moveWager4), outcome: WagerStatus.WON, winnings: 180 },
          { ...getWagerIDs(moveWager5), outcome: WagerStatus.WON, winnings: 240 },
          { ...getWagerIDs(moveWager6), outcome: WagerStatus.LOST, winnings: 0 },
        ].map((pw) => ({ ...pw, winning_pool_share: 2.4 }));

        processedWagers.forEach((pw, i) => expect(pw).toEqual(expectedWagers[i]));
      });

      it('No winners', () => {
        const processedWagers = processCriticalMoveWagers(moveWagers, 'Bc8');
        // $420 in pool, $0/$420 placed on the correct move
        const expectedWagers = [
          { ...getWagerIDs(moveWager0), outcome: WagerStatus.CANCELLED, winnings: 50 },
          { ...getWagerIDs(moveWager1), outcome: WagerStatus.CANCELLED, winnings: 50 },
          { ...getWagerIDs(moveWager2), outcome: WagerStatus.CANCELLED, winnings: 25 },
          { ...getWagerIDs(moveWager3), outcome: WagerStatus.CANCELLED, winnings: 25 },
          { ...getWagerIDs(moveWager4), outcome: WagerStatus.CANCELLED, winnings: 75 },
          { ...getWagerIDs(moveWager5), outcome: WagerStatus.CANCELLED, winnings: 100 },
          { ...getWagerIDs(moveWager6), outcome: WagerStatus.CANCELLED, winnings: 95 },
        ].map((pw) => ({ ...pw, winning_pool_share: Number('Infinity') }));

        processedWagers.forEach((pw, i) => expect(pw).toEqual(expectedWagers[i]));
      });
    });

    describe('One person pool', () => {
      it('Person wins', () => {
        const processedWagers = processCriticalMoveWagers([moveWager0], 'e4');
        // $50 in pool, $50/$50 placed on the correct move
        expect(processedWagers).toEqual([{
          ...getWagerIDs(moveWager0), outcome: WagerStatus.WON, winnings: 50, winning_pool_share: 1,
        }]);
      });

      it('Person loses', () => {
        const processedWagers = processCriticalMoveWagers([moveWager0], 'd4');
        // $50 in pool, $0/$50 placed on the correct move
        expect(processedWagers).toEqual([{
          ...getWagerIDs(moveWager0), outcome: WagerStatus.CANCELLED, winnings: 50, winning_pool_share: Number('Infinity'),
        }]);
      });
    });

    describe('Empty pool', () => {
      it('Any wager', () => {
        const winningsByUserId = processCriticalMoveWagers([], 'e4');
        expect(winningsByUserId).toEqual([]);
      });
    });
  });
});
