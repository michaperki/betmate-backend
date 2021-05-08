import mongoose from 'mongoose';
import { Wager } from 'models';
import { GameStatus, WagerStatus } from 'types/models';
import { getCriticalMoveWinningsByUserId, getWagerOutcomes, getWDLWinningsByUserId } from '../resolve_bets';

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
  wdl: true,
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
      describe('Multiperson pool', () => {
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

      describe('One person pool', () => {
        it('Person wins', () => {
          const outcomes = getWagerOutcomes([moveWager0], 'e4');
          expect(outcomes).toEqual({
            [WagerStatus.WON]: [String(moveWager0._id)],
            [WagerStatus.LOST]: [],
          });
        });

        it('Person lost', () => {
          const outcomes = getWagerOutcomes([moveWager0], 'd4');
          expect(outcomes).toEqual({
            [WagerStatus.WON]: [],
            [WagerStatus.LOST]: [String(moveWager0._id)],
          });
        });
      });

      describe('No one in pool', () => {
        it('Any move', () => {
          const outcomes = getWagerOutcomes([], 'd4');
          expect(outcomes).toEqual({
            [WagerStatus.WON]: [],
            [WagerStatus.LOST]: [],
          });
        });
      });
    });
  });

  describe('Working getWDLWinningsByUserId', () => {
    it('Behaves correctly with dummy data', () => {
      const winningsByUserId = getWDLWinningsByUserId(wdlWagers, GameStatus.WHITE_WIN);
      expect(winningsByUserId).toEqual({
        [String(player1Id)]: 225, // 2/3 bets placed by user 1 were successful (150 + 75)
        [String(player2Id)]: 300, // 1/1 bets won (200 * 1.5)
        [String(player3Id)]: 0, // 0/1 bets won (guessed black_win)
        [String(player4Id)]: 0, // 0/2 bets won (guessed draw + black_win)
      });
    });

    it('Behaves correctly with no wager data', () => {
      const winningsByUserId = getWDLWinningsByUserId([], GameStatus.WHITE_WIN);
      expect(winningsByUserId).toEqual({});
    });

    it('Behaves correctly when no one wins', () => {
      const winningsByUserId = getWDLWinningsByUserId(wdlWagers, 'UNEXPECTED_OUTCOME');
      expect(winningsByUserId).toEqual({
        [String(player1Id)]: 0,
        [String(player2Id)]: 0,
        [String(player3Id)]: 0,
        [String(player4Id)]: 0,
      });
    });
  });

  describe('Working getCriticalMoveWinningsByUserId', () => {
    it('Behaves correctly with dummy data', () => {
      const winningsByUserId = getCriticalMoveWinningsByUserId(moveWagers, 'e4');
      // $425 in pool, $100/$425 placed on the correct move
      expect(winningsByUserId).toEqual({
        [String(player1Id)]: 318.75, // 75% of winning pool, 2/3 bets were correct
        [String(player2Id)]: 106.25, // 25% of winning pool
        [String(player3Id)]: 0, // one wrong bet
        [String(player4Id)]: 0, // two wrong bets
      });
    });

    it('With one person pool (pool is won)', () => {
      const winningsByUserId = getCriticalMoveWinningsByUserId([moveWager0], 'e4');
      // $50 in pool, $50/$50 placed on the correct move
      expect(winningsByUserId).toEqual({
        [String(player1Id)]: 50, // player 1 wins back their $50
      });
    });

    it('With one person pool (pool is lost)', () => {
      const winningsByUserId = getCriticalMoveWinningsByUserId([moveWager0], 'd4');
      // $50 in pool, $0/$50 placed on the correct move
      expect(winningsByUserId).toEqual({
        [String(player1Id)]: 50, // player 1 gets refund
      });
    });

    it('Behaves correctly with no wager data', () => {
      const winningsByUserId = getCriticalMoveWinningsByUserId([], 'e4');
      expect(winningsByUserId).toEqual({});
    });

    it('Behaves correctly when no one wins', () => {
      const winningsByUserId = getCriticalMoveWinningsByUserId(moveWagers, 'h4');
      // everyone gets refund
      expect(winningsByUserId).toEqual({
        [String(player1Id)]: 125,
        [String(player2Id)]: 25,
        [String(player3Id)]: 75,
        [String(player4Id)]: 200,
      });
    });
  });
});
