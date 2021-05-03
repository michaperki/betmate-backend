import { Chess, Users, Wager } from 'models';
import { GameStatus } from 'helpers/constants';

import { WagerStatus } from 'types/models';
import { connectDB, dropDB } from '../../../__jest__/helpers';

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

describe('Wager model validation', () => {
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

  it('creates and saves a WDL wager successfully', async (done) => {
    try {
      // Set up environment
      const user = await new Users(userData).save();
      const game = await new Chess(chessData).save();

      // Create a new wager model
      const validWager = new Wager({
        ...wagerDataWDL,
        game_id: game._id,
        better_id: user._id,
      });
      const savedWager = await validWager.save();

      // Checks chess has been saved to testing DB
      expect(savedWager._id).toBeDefined();
      expect(savedWager.game_id).toBe(game._id);
      expect(savedWager.better_id).toBe(user._id);
      expect(savedWager.wdl).toBe(wagerDataWDL.wdl);
      expect(savedWager.amount).toBe(wagerDataWDL.amount);
      expect(savedWager.odds).toBe(wagerDataWDL.odds);
      expect(savedWager.data).toBe(wagerDataWDL.data);
      expect(savedWager.resolved).toBe(false);
      expect(savedWager.status).toBe(WagerStatus.PENDING);
      expect(savedWager.created_at).toBeInstanceOf(Date);
      expect(savedWager.updated_at).toBeInstanceOf(Date);

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
