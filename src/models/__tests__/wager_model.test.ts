import { isWagerResolved } from 'validation/wager';
import { Chess, Users, Wager } from 'models';
import { Types, UpdateQuery } from 'mongoose';
import { GameStatus } from 'types/models/chess';
import { WagerDoc, WagerStatus } from 'types/models/wager';

import { connectDB, dropDB } from '../../../__jest__/helpers';

/* -------- Set up data -------- */

const chessData = {
  player_white: { name: 'playerA', elo: 200 },
  player_black: { name: 'playerB', elo: 400 },
};

const userData = {
  email: 'test@test.com',
  password: 'password',
  first_name: 'Joe',
  last_name: 'Smith',
  resource: null,
};

const wagerDataWDL = {
  wdl: true,
  amount: 10,
  odds: 1.5,
  data: GameStatus.WHITE_WIN,
  move_number: 10,
};

const badWagerDataWDL = {
  wdl: 'wdl', // should be boolean
  amount: -10, // should be positive number
  odds: 0.5, // should be greater than 1
  data: GameStatus.WHITE_WIN, // takes any data type
  move: -10, // should be positive number
  status: 'waiting', // not of type WagerStatus
};

let userID = '';
let gameID = '';
let wagerID = '';

/* -------- Helper function -------- */

const validateWager = (wager: WagerDoc, data: Partial<WagerDoc>) => {
  expect(wager._id).toBeDefined();
  expect(wager.game_id).toStrictEqual(data.game_id);
  expect(wager.better_id).toStrictEqual(data.better_id);
  expect(wager.wdl).toBe(data.wdl);
  expect(wager.amount).toBe(data.amount);
  expect(wager.odds).toBe(data.odds);
  expect(wager.data).toBe(data.data);
  expect(wager.resolved).toBe(isWagerResolved(data.status ?? WagerStatus.PENDING));
  expect(wager.status).toBe(data.status ?? WagerStatus.PENDING);
  expect(wager.winning_pool_share).toBe(data.winning_pool_share ?? 1);
  expect(wager.winnings).toBeDefined();
  expect(wager.created_at).toBeInstanceOf(Date);
  expect(wager.updated_at).toBeInstanceOf(Date);
};

/* -------- Tests -------- */

describe('Wager model validation', () => {
  beforeAll(async (done) => {
    try {
      connectDB(done);
    } catch (error) {
      done(error);
    }
  });

  beforeAll(async (done) => {
    try {
      const user = await new Users(userData).save();
      userID = user._id;
      const game = await new Chess(chessData).save();
      gameID = game._id;
      done();
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
    it('creates and saves a WDL wager successfully', async (done) => {
      try {
        const wagerData: Partial<WagerDoc> = {
          ...wagerDataWDL,
          game_id: Types.ObjectId(gameID),
          better_id: Types.ObjectId(userID),
        };
        // Create a new wager model
        const validWager = new Wager(wagerData);
        const savedWager = await validWager.save();

        // Checks wager has been saved to testing DB
        validateWager(savedWager, wagerData);

        wagerID = savedWager._id;

        done();
      } catch (error) {
        done(error);
      }
    });

    it('blocks wager without required fields', async (done) => {
      try {
        // Creates a new wager object
        const invalidWager = new Wager({}); // Needs game_id, better_id, wdl, amount, odds, data

        const savedWager = await new Promise<Error>((resolve, reject) => {
          invalidWager.save().then((wager) => {
            reject(wager);
          }).catch((err: Error) => {
            resolve(err);
          });
        });

        // eslint-disable-next-line max-len
        expect(savedWager.message).toBe('Wager validation failed: move_number: Path `move_number` is required., data: Path `data` is required., odds: Path `odds` is required., amount: Path `amount` is required., wdl: Path `wdl` is required., better_id: Path `better_id` is required., game_id: Path `game_id` is required.');
        done();
      } catch (error) {
        done(error);
      }
    });

    it('blocks WDL wager with invalid domain values', async (done) => {
      try {
        // Set up environment
        const user = await new Users({ ...userData, email: 'test2@test.com' }).save();
        const game = await new Chess(chessData).save();

        // Create a new wager model
        const invalidWager = new Wager({
          ...badWagerDataWDL,
          game_id: game._id,
          better_id: user._id,
        });
        const saveError = await new Promise<Error>((resolve, reject) => {
          invalidWager.save().then(() => {
            reject(Error('Invalid wager was successfully saved'));
          }).catch((err: Error) => {
            resolve(err);
          });
        });

        // eslint-disable-next-line max-len
        expect(saveError.message).toBe('Wager validation failed: wdl: Cast to Boolean failed for value "wdl" at path "wdl", move_number: Path `move_number` is required., amount: Path `amount` (-10) is less than minimum allowed value (0.01)., odds: Path `odds` (0.5) is less than minimum allowed value (1)., status: Value "waiting" not in enum "WagerStatus"');
        done();
      } catch (error) {
        done(error);
      }
    });

    it('blocks chess game with nonexistant game_id or better_id', async (done) => {
      try {
        // Creates a new wager object
        const invalidWager = new Wager({
          ...wagerDataWDL,
          game_id: 'fakeGameID', // does not exist in db
          better_id: 'fakeUserID', // does not exist in db
        });
        const saveError = await new Promise<Error>((resolve, reject) => {
          invalidWager.save().then(() => {
            reject(Error('Invalid wager was successfully saved'));
          }).catch((err: Error) => {
            resolve(err);
          });
        });

        // eslint-disable-next-line max-len
        expect(saveError.message).toBe('Wager validation failed: game_id: Cast to ObjectId failed for value "fakeGameID" at path "game_id", better_id: Cast to ObjectId failed for value "fakeUserID" at path "better_id"');
        done();
      } catch (error) {
        done(error);
      }
    });
  });

  describe('update one', () => {
    it('prevents update of immutable fields', async (done) => {
      try {
        // all fields are immutable
        const badNewWagerFields = {
          game_id: Types.ObjectId(),
          better_id: Types.ObjectId(),
          wdl: false,
          amount: 5.5,
          odds: 2.3,
          data: 'Nxf3',
          move_number: 11,
        };

        const updatedWager = await Wager.findByIdAndUpdate(wagerID, badNewWagerFields, { new: true, runValidators: true });

        const wagerData: Partial<WagerDoc> = {
          ...wagerDataWDL,
          game_id: Types.ObjectId(gameID),
          better_id: Types.ObjectId(userID),
        };
        if (updatedWager) {
          validateWager(updatedWager, wagerData);
        } else {
          done('Error updating wager');
        }

        done();
      } catch (error) {
        done(error);
      }
    });

    it('prevents update of fields with invalid values', async (done) => {
      try {
        const badFields = {
          status: 'done', // not a valid WagerStatus
        };
        const updateError = await new Promise<Error>((res, rej) => {
          Wager.findByIdAndUpdate(wagerID, badFields as UpdateQuery<WagerDoc>, { runValidators: true })
            .then(() => rej(Error('Update succeeded')))
            .catch((err: Error) => res(err));
        });

        expect(updateError.message).toBe('Validation failed: status: Value "done" not in enum "WagerStatus"');
        done();
      } catch (error) {
        done(error);
      }
    });

    it('succeeds', async (done) => {
      try {
        const newFields = {
          resolved: true,
          status: WagerStatus.WON,
          winning_pool_share: Number('Infinity'),
        };

        const updatedFields = {
          ...wagerDataWDL,
          ...newFields,
          game_id: Types.ObjectId(gameID),
          better_id: Types.ObjectId(userID),
        };

        const updatedWager = await Wager.findByIdAndUpdate(wagerID, newFields, { new: true, runValidators: true });
        if (updatedWager) {
          validateWager(updatedWager, updatedFields);
          done();
        } else {
          done('Update unsucessful');
        }
      } catch (error) {
        done(error);
      }
    });
  });
});
