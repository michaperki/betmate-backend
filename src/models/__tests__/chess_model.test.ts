import { CHESS_START, GameStatus } from '../../helpers/constants';
import { Chess } from '..';

import { connectDB, dropDB } from '../../../__jest__/helpers';

// minimal fields
const chessDataA = {
  player_white: 'playerA',
  player_black: 'playerB',
};

// all fields
const chessDataB = {
  state: 'r2qkbnr/pppbp1pp/2n2p2/1B1p4/3P1B2/4P3/PPP2PPP/RN1QK1NR w KQkq - 0 1',
  complete: false,
  game_status: GameStatus.IN_PROGRESS,
  player_white: 'playerC',
  player_black: 'playerD',
  move_hist: ['d4', 'd5', 'Bf4', 'Nc6', 'e3', 'f6', 'Bb5', 'Bd7'],
  wagers: [],
  time_white: 293,
  time_black: 291,
};

describe('Chess model validation', () => {
  beforeAll(async (done) => {
    try {
      connectDB(done);
    } catch (error) {
      done(error);
    }
  });

  afterAll(async (done) => {
    try {
      dropDB(done);
    } catch (error) {
      done(error);
    }
  });

  it('creates and saves a chess game successfully with minimal requirements', async (done) => {
    try {
      // Creates a new chess object
      const validGame = new Chess(chessDataA);
      const savedGame = await validGame.save();

      // Checks chess has been saved to testing DB
      expect(savedGame._id).toBeDefined();
      expect(savedGame.state).toBe(CHESS_START);
      expect(savedGame.complete).toBe(false);
      expect(savedGame.game_status).toBe(GameStatus.NOT_STARTED);
      expect(savedGame.player_white).toBe(chessDataA.player_white);
      expect(savedGame.player_black).toBe(chessDataA.player_black);
      expect([...savedGame.move_hist]).toStrictEqual([]);
      expect([...savedGame.wagers]).toStrictEqual([]);
      expect(savedGame.time_white).toBe(600);
      expect(savedGame.time_black).toBe(600);

      done();
    } catch (error) {
      done(error);
    }
  });

  it('creates and saves a chess game successfully with all fields', async (done) => {
    try {
      // Creates a new chess object
      const validGame = new Chess(chessDataB);
      const savedGame = await validGame.save();

      // Checks chess has been saved to testing DB
      expect(savedGame._id).toBeDefined();
      expect(savedGame.state).toBe(chessDataB.state);
      expect(savedGame.complete).toBe(chessDataB.complete);
      expect(savedGame.game_status).toBe(chessDataB.game_status);
      expect(savedGame.player_white).toBe(chessDataB.player_white);
      expect(savedGame.player_black).toBe(chessDataB.player_black);
      expect([...savedGame.move_hist]).toStrictEqual(chessDataB.move_hist);
      expect([...savedGame.wagers]).toStrictEqual(chessDataB.wagers);
      expect(savedGame.time_white).toBe(chessDataB.time_white);
      expect(savedGame.time_black).toBe(chessDataB.time_black);

      done();
    } catch (error) {
      done(error);
    }
  });

  it('blocks chess game without required fields', async (done) => {
    try {
      // Creates a new chess game object
      const invalidGame = new Chess({}); // Needs player_white, player_black

      const savedGame = await new Promise<Error>((resolve, reject) => {
        invalidGame.save().then((user) => {
          reject(user);
        }).catch((err: Error) => {
          resolve(err);
        });
      });

      expect(savedGame.message).toBe('Chess validation failed: player_black: Path `player_black` is required., player_white: Path `player_white` is required.');
      done();
    } catch (error) {
      done(error);
    }
  });
});
