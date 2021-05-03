import { CHESS_START, GameStatus } from 'helpers/constants';
import { Chess } from 'models';

import { connectDB, dropDB } from '../../../__jest__/helpers';

// minimal fields
const chessDataA = {
  player_white: { name: 'playerA', elo: 200 },
  player_black: { name: 'playerB', elo: 400 },
};

// all fields
const chessDataB = {
  state: 'r2qkbnr/pppbp1pp/2n2p2/1B1p4/3P1B2/4P3/PPP2PPP/RN1QK1NR w KQkq - 0 1',
  complete: false,
  game_status: GameStatus.IN_PROGRESS,
  player_white: { name: 'playerA', elo: 200 },
  player_black: { name: 'playerB', elo: 400 },
  move_hist: ['d4', 'd5', 'Bf4', 'Nc6', 'e3', 'f6', 'Bb5', 'Bd7'],
  wagers: [],
  time_white: 293,
  time_black: 291,
};

// invalid game
const badChessData = {
  state: 'r2qkbnr/pppbp1pp/2n2p3P1B2/4P3/PPP2PPP/RN1QK1NR w KQkq - 0 1', // bad fen
  game_status: 'begun', // Not in enum GameStatus
  wagers: ['fakeWagerID'], // Not a real id for wager
  time_white: -10, // Should be positive
  time_black: -10, // Should be positive
  player_white: { name: 'playerA', elo: 200 },
  player_black: { name: 'playerB', elo: 400 },
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
      expect({ ...savedGame.player_white }).toStrictEqual(chessDataA.player_white);
      expect({ ...savedGame.player_black }).toStrictEqual(chessDataA.player_black);
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
      expect({ ...savedGame.player_white }).toStrictEqual(chessDataB.player_white);
      expect({ ...savedGame.player_black }).toStrictEqual(chessDataB.player_black);
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

      const saveError = await new Promise<Error>((resolve, reject) => {
        invalidGame.save().then(() => {
          reject(Error('Invalid chess game was successfully saved'));
        }).catch((err: Error) => {
          resolve(err);
        });
      });

      // eslint-disable-next-line max-len
      expect(saveError.message).toBe('Chess validation failed: player_black.elo: Path `player_black.elo` is required., player_black.name: Path `player_black.name` is required., player_white.elo: Path `player_white.elo` is required., player_white.name: Path `player_white.name` is required.');
      done();
    } catch (error) {
      done(error);
    }
  });

  it('blocks chess game with invalid domain values', async (done) => {
    try {
      // Creates a new chess game object
      const invalidGame = new Chess(badChessData);

      const saveError = await new Promise<Error>((resolve, reject) => {
        invalidGame.save().then(() => {
          reject(Error('Invalid chess game was successfully saved'));
        }).catch((err: Error) => {
          resolve(err);
        });
      });

      // eslint-disable-next-line max-len
      expect(saveError.message).toBe('Chess validation failed: wagers.0: Cast to ObjectId failed for value "fakeWagerID" at path "wagers", wagers: Cast to Array failed for value "[ \'fakeWagerID\' ]" at path "wagers", state: 1st field (piece positions) does not contain 8 \'/\'-delimited rows., game_status: Value "begun" not in enum "GameStatus", time_white: Path `time_white` (-10) is less than minimum allowed value (0)., time_black: Path `time_black` (-10) is less than minimum allowed value (0).');
      done();
    } catch (error) {
      done(error);
    }
  });
});
