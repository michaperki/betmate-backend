import mongoose from 'mongoose';
import { Wager } from 'models';
import { GameStatus, WagerStatus } from 'types/models';
import { getCriticalMoveWinningsByUser, getWagerOutcomes, getWDLWinningsByUser } from '../resolve_bets';

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
  amount: 100,
  data: 'Nf3',
  move_number: 1,
});
// 425
const moveWagers = [moveWager0, moveWager1, moveWager2, moveWager3, moveWager4, moveWager5, moveWager6];

describe('Bet resolution logic', () => {
  describe('Working getWagerOutcomes', () => {
    describe('For WDL bets', () => {
      it('Handles white win', () => {
        const outcomes = getWagerOutcomes(wdlWagers, GameStatus.WHITE_WIN);
        expect(outcomes).toEqual({
          [WagerStatus.WON]: [String(wdlWager0._id), String(wdlWager1._id), String(wdlWager3._id)],
          [WagerStatus.LOST]: [String(wdlWager2._id), String(wdlWager4._id), String(wdlWager5._id), String(wdlWager6._id)],
        });
      });

      it('Handles black win', () => {
        const outcomes = getWagerOutcomes(wdlWagers, GameStatus.BLACK_WIN);
        expect(outcomes).toEqual({
          [WagerStatus.WON]: [String(wdlWager2._id), String(wdlWager5._id)],
          [WagerStatus.LOST]: [String(wdlWager0._id), String(wdlWager1._id), String(wdlWager3._id), String(wdlWager4._id), String(wdlWager6._id)],
        });
      });

      it('Handles draw', () => {
        const outcomes = getWagerOutcomes(wdlWagers, GameStatus.DRAW);
        expect(outcomes).toEqual({
          [WagerStatus.WON]: [String(wdlWager4._id), String(wdlWager6._id)],
          [WagerStatus.LOST]: [String(wdlWager0._id), String(wdlWager1._id), String(wdlWager2._id), String(wdlWager3._id), String(wdlWager5._id)],
        });
      });

      it('Handles no bets', () => {
        const outcomes = getWagerOutcomes([], GameStatus.WHITE_WIN);
        expect(outcomes).toEqual({
          [WagerStatus.WON]: [],
          [WagerStatus.LOST]: [],
        });
      });
    });

    describe('For move bets', () => {
      it('With winners 1', () => {
        const outcomes = getWagerOutcomes(moveWagers, 'e4');
        expect(outcomes).toEqual({
          [WagerStatus.WON]: [String(moveWager0._id), String(moveWager2._id), String(moveWager3._id)],
          [WagerStatus.LOST]: [String(moveWager1._id), String(moveWager4._id), String(moveWager5._id), String(moveWager6._id)],
        });
      });

      it('With winners 2', () => {
        const outcomes = getWagerOutcomes(moveWagers, 'd4');
        expect(outcomes).toEqual({
          [WagerStatus.WON]: [String(moveWager1._id)],
          [WagerStatus.LOST]: [String(moveWager0._id), String(moveWager2._id), String(moveWager3._id), String(moveWager4._id), String(moveWager5._id), String(moveWager6._id)],
        });
      });

      it('With winners 3', () => {
        const outcomes = getWagerOutcomes(moveWagers, 'Nc3');
        expect(outcomes).toEqual({
          [WagerStatus.WON]: [String(moveWager4._id), String(moveWager5._id)],
          [WagerStatus.LOST]: [String(moveWager0._id), String(moveWager1._id), String(moveWager2._id), String(moveWager3._id), String(moveWager6._id)],
        });
      });

      it('With winners 4', () => {
        const outcomes = getWagerOutcomes(moveWagers, 'Nf3');
        expect(outcomes).toEqual({
          [WagerStatus.WON]: [String(moveWager6._id)],
          [WagerStatus.LOST]: [String(moveWager0._id), String(moveWager1._id), String(moveWager2._id), String(moveWager3._id), String(moveWager4._id), String(moveWager5._id)],
        });
      });

      it('No winners', () => {
        const outcomes = getWagerOutcomes(moveWagers, 'Bf3');
        expect(outcomes).toEqual({
          [WagerStatus.WON]: [],
          [WagerStatus.LOST]: moveWagers.map((w) => String(w._id)),
        });
      });
    });

    describe('Empty pool', () => {
      it('Any move', () => {
        const outcomes = getWagerOutcomes([], 'd4');
        expect(outcomes).toEqual({
          [WagerStatus.WON]: [],
          [WagerStatus.LOST]: [],
        });
      });
    });
  });

  describe('Working getWDLWinningsByUserId', () => {
    it('Handles white win', () => {
      const winningsByUserId = getWDLWinningsByUser(wdlWagers, GameStatus.WHITE_WIN);
      expect(winningsByUserId).toEqual({
        [String(player1Id)]: 225, // 2/3 bets won (150 + 75)
        [String(player2Id)]: 300, // 1/1 bets won (200 * 1.5)
        [String(player3Id)]: 0, // 0/1 bets won (guessed draw)
        [String(player4Id)]: 0, // 0/2 bets won (guessed draw + black_win)
      });
    });

    it('Handles black win', () => {
      const winningsByUserId = getWDLWinningsByUser(wdlWagers, GameStatus.BLACK_WIN);
      expect(winningsByUserId).toEqual({
        [String(player1Id)]: 125, // 1/3 bets won (50 * 2.5)
        [String(player2Id)]: 0, // 0/1 bets won (guessed white_win)
        [String(player3Id)]: 0, // 0/1 bets won (guessed black_win)
        [String(player4Id)]: 250, // 1/2 bets won (100 * 2.5)
      });
    });

    it('Handles draw', () => {
      const winningsByUserId = getWDLWinningsByUser(wdlWagers, GameStatus.DRAW);
      expect(winningsByUserId).toEqual({
        [String(player1Id)]: 0, // 0/3 bets won (guessed white_win + black_win)
        [String(player2Id)]: 0, // 0/1 bets won (guessed white_win)
        [String(player3Id)]: 225, // 1/1 bets won (75 * 3)
        [String(player4Id)]: 300, // 1/2 bets won (100 * 3)
      });
    });

    it('Handles no winners', () => {
      const winningsByUserId = getWDLWinningsByUser(wdlWagers, 'UNEXPECTED_OUTCOME');
      expect(winningsByUserId).toEqual({
        [String(player1Id)]: 0,
        [String(player2Id)]: 0,
        [String(player3Id)]: 0,
        [String(player4Id)]: 0,
      });
    });

    it('Handles no wager data', () => {
      const winningsByUserId = getWDLWinningsByUser([], GameStatus.WHITE_WIN);
      expect(winningsByUserId).toEqual({});
    });
  });

  describe('Working getCriticalMoveWinningsByUserId', () => {
    describe('Multiperson pool', () => {
      it('With winners 1', () => {
        const winningsByUserId = getCriticalMoveWinningsByUser(moveWagers, 'e4');
        // $425 in pool, $100/$425 placed on the correct move
        expect(winningsByUserId).toEqual({
          [String(player1Id)]: 318.75, // 75% of winning pool, 2/3 bets were correct
          [String(player2Id)]: 106.25, // 25% of winning pool, 1/1 bets were correct
          [String(player3Id)]: 0, // one wrong bet
          [String(player4Id)]: 0, // two wrong bets
        });
      });

      it('With winners 2', () => {
        const winningsByUserId = getCriticalMoveWinningsByUser(moveWagers, 'd4');
        expect(winningsByUserId).toEqual({
          [String(player1Id)]: 425, // 100% of winning pool, 1/3 bets were correct
          [String(player2Id)]: 0, // one wrong bet
          [String(player3Id)]: 0, // one wrong bet
          [String(player4Id)]: 0, // two wrong bets
        });
      });

      it('With winners 3', () => {
        const winningsByUserId = getCriticalMoveWinningsByUser(moveWagers, 'Nc3');
        expect(winningsByUserId[String(player1Id)]).toBeCloseTo(0); // three wrong bets
        expect(winningsByUserId[String(player2Id)]).toBeCloseTo(0); // one wrong bets
        expect(winningsByUserId[String(player3Id)]).toBeCloseTo(182.142); // 42.86% of winning pool, 1/1 bets were correct
        expect(winningsByUserId[String(player4Id)]).toBeCloseTo(242.857); // 57.14% of winning pool, 1/2 bets were correct
      });

      it('With winners 4', () => {
        const winningsByUserId = getCriticalMoveWinningsByUser(moveWagers, 'Nf3');
        expect(winningsByUserId).toEqual({
          [String(player1Id)]: 0, // three wrong bets
          [String(player2Id)]: 0, // one wrong bet
          [String(player3Id)]: 0, // one wrong bet
          [String(player4Id)]: 425, // 100% of winning pool, 1/2 bets were correct
        });
      });

      it('No winners', () => {
        const winningsByUserId = getCriticalMoveWinningsByUser(moveWagers, 'h4');
        // everyone gets refund
        expect(winningsByUserId).toEqual({
          [String(player1Id)]: 125,
          [String(player2Id)]: 25,
          [String(player3Id)]: 75,
          [String(player4Id)]: 200,
        });
      });
    });

    describe('One person pool', () => {
      it('Person wins', () => {
        const winningsByUserId = getCriticalMoveWinningsByUser([moveWager0], 'e4');
        // $50 in pool, $50/$50 placed on the correct move
        expect(winningsByUserId).toEqual({
          [String(player1Id)]: 50, // player 1 wins back their $50
        });
      });

      it('Person loses', () => {
        const winningsByUserId = getCriticalMoveWinningsByUser([moveWager0], 'd4');
        // $50 in pool, $0/$50 placed on the correct move
        expect(winningsByUserId).toEqual({
          [String(player1Id)]: 50, // player 1 gets refund
        });
      });
    });

    describe('Empty pool', () => {
      it('Any wager', () => {
        const winningsByUserId = getCriticalMoveWinningsByUser([], 'e4');
        expect(winningsByUserId).toEqual({});
      });
    });
  });
});
