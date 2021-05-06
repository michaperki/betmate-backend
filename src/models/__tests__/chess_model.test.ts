import { CHESS_START } from 'helpers/constants';
import { isGameComplete } from 'helpers/validation/chess';
import { Chess } from 'models';
import { Types } from 'mongoose';
import { ChessDoc, GameStatus } from 'types/models';

import { connectDB, dropDB } from '../../../__jest__/helpers';

// minimal fields
const chessDataA: Partial<ChessDoc> = {
  player_white: { name: 'playerA', elo: 200 },
  player_black: { name: 'playerB', elo: 400 },
};

// all fields
const chessDataB: Partial<ChessDoc> = {
  state: 'r2qkbnr/pppbp1pp/2n2p2/1B1p4/3P1B2/4P3/PPP2PPP/RN1QK1NR w KQkq - 0 1',
  game_status: GameStatus.IN_PROGRESS,
  player_white: { name: 'playerA', elo: 200 },
  player_black: { name: 'playerB', elo: 400 },
  move_hist: ['d4', 'd5', 'Bf4', 'Nc6', 'e3', 'f6', 'Bb5', 'Bd7'] as Types.Array<string>,
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

let gameIdA = '';
let gameIdB = '';

const validateGame = (game: ChessDoc, data: Partial<ChessDoc>) => {
  expect(game._id).toBeDefined();
  expect(game.state).toBe(data.state ?? CHESS_START);
  expect(game.complete).toBe(isGameComplete(data.game_status ?? GameStatus.NOT_STARTED));
  expect(game.game_status).toBe(data.game_status ?? GameStatus.NOT_STARTED);
  expect(game.player_white.name).toBe(data.player_white?.name);
  expect(game.player_white.elo).toBe(data.player_white?.elo);
  expect(game.player_black.name).toBe(data.player_black?.name);
  expect(game.player_black.elo).toBe(data.player_black?.elo);
  expect([...game.move_hist]).toStrictEqual(data.move_hist ?? []);
  expect([...game.wagers]).toStrictEqual([]);
  expect(game.time_white).toBe(data.time_white ?? 600);
  expect(game.time_black).toBe(data.time_black ?? 600);
  expect(game.odds.white_win).toBeDefined();
  expect(game.odds.draw).toBeDefined();
  expect(game.odds.black_win).toBeDefined();
  expect(game.created_at).toBeInstanceOf(Date);
  expect(game.updated_at).toBeInstanceOf(Date);
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

  describe('create one', () => {
    it('creates and saves a chess game successfully with minimal requirements', async (done) => {
      try {
        // Creates a new chess object
        const validGame = new Chess(chessDataA);
        const savedGame = await validGame.save();

        // Checks chess has been saved to testing DB
        validateGame(savedGame, chessDataA);

        gameIdA = savedGame._id;

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
        validateGame(savedGame, chessDataB);

        gameIdB = savedGame._id;

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

        expect(saveError.message).toBe('Chess validation failed: player_black: Path `player_black` is required., player_white: Path `player_white` is required.');
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

  describe('update one', () => {
    it('does not allow update of timestamps', async (done) => {
      try {
        const createdAt = new Date('2019-03-02');
        const updatedAt = new Date('2019-04-22');
        const updatedGameA = await Chess.findByIdAndUpdate(gameIdA, { created_at: createdAt, updated_at: updatedAt }, { new: true, runValidators: true });

        if (updatedGameA) {
          validateGame(updatedGameA, chessDataA);
          expect(updatedGameA.created_at).not.toBe(createdAt);
          expect(updatedGameA.updated_at).not.toBe(updatedAt);

          done();
        } else {
          done('error updating game');
        }
      } catch (error) {
        done(error);
      }
    });

    it('does not allow update of player fields', async (done) => {
      try {
        const newWhitePlayer = { name: 'playerX', elo: 3000 };
        const newBlackPlayer = { name: 'playerY', elo: 2500 };
        const updatedGameB = await Chess.findByIdAndUpdate(gameIdB, { player_white: newWhitePlayer, player_black: newBlackPlayer }, { new: true, runValidators: true });

        if (updatedGameB) {
          validateGame(updatedGameB, chessDataB);
        }
        done();
      } catch (error) {
        done(error);
      }
    });

    it('does not allow update with invalid field types', async (done) => {
      try {
        const {
          // eslint-disable-next-line @typescript-eslint/naming-convention, no-unused-vars
          player_black, player_white, wagers, ...badDataFields
        } = badChessData;

        const updateError = await new Promise<Error>((res, rej) => {
          Chess
            .findByIdAndUpdate(gameIdA, badDataFields as Partial<ChessDoc>, { new: true, runValidators: true })
            .then(() => rej(Error('Update succeeded')))
            .catch((err: Error) => res(err));
        });
        // eslint-disable-next-line max-len
        expect(updateError.message).toBe('Validation failed: time_black: Path `time_black` (-10) is less than minimum allowed value (0)., time_white: Path `time_white` (-10) is less than minimum allowed value (0)., game_status: Value "begun" not in enum "GameStatus", state: 1st field (piece positions) does not contain 8 \'/\'-delimited rows.');
        done();
      } catch (error) {
        done(error);
      }
    });

    it('succeeds', async (done) => {
      try {
        const {
          // eslint-disable-next-line @typescript-eslint/naming-convention, no-unused-vars
          player_black, player_white, wagers, ...updateFields
        } = chessDataB;

        const updatedGame = await Chess.findByIdAndUpdate(gameIdA, updateFields, { new: true, runValidators: true });

        if (updatedGame) {
          validateGame(updatedGame, { ...chessDataA, ...updateFields });
          done();
        } else {
          done('there was an issue updating the game');
        }
      } catch (error) {
        done(error);
      }
    });
  });
});
