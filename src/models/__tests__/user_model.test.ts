import * as bcrypt from 'bcrypt';
import { Users as UserModel } from 'models';

import { connectDB, dropDB } from '../../../__jest__/helpers';

/* -------- Set up data -------- */

const userData = {
  email: 'test@test.com',
  password: 'password',
  first_name: 'Joe',
  last_name: 'Smith',
  resource: null,
};

/* -------- Tests -------- */

describe('User model validation', () => {
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

  it('creates and saves a user successfully', async (done) => {
    try {
      // Creates a new user object
      const validUser = new UserModel(userData);
      const savedUser = await validUser.save();

      // Checks user has been saved to testing DB
      expect(savedUser._id).toBeDefined();
      expect(savedUser.email).toBe(userData.email);
      expect(savedUser.first_name).toBe(userData.first_name);
      expect(savedUser.last_name).toBe(userData.last_name);

      // Compares hashed to expected password
      let passCompareResult = false;
      passCompareResult = await new Promise((resolve, reject) => {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        bcrypt.compare(userData.password, savedUser.password!, (err, result) => { if (err) { reject(err); } resolve(result); });
      });
      expect(passCompareResult).toBe(true);
      done();
    } catch (error) {
      done(error);
    }
  });

  it('blocks users without required fields', async (done) => {
    try {
      // Creates a new user object
      const invalidUser = new UserModel({}); // Needs email, password

      const saveError = await new Promise<Error>((resolve, reject) => {
        invalidUser.save().then(() => {
          reject(Error('Invalid user was successfully saved'));
        }).catch((err) => {
          resolve(err);
        });
      });

      expect(saveError.message).toBe('User validation failed: password: Path `password` is required., email: Path `email` is required.');
      done();
    } catch (error) {
      done(error);
    }
  });

  it('loads virtuals correctly', async (done) => {
    try {
      const users = await UserModel.find({});
      expect(users[0].full_name).toBe(`${userData.first_name} ${userData.last_name}`);
      done();
    } catch (error) {
      done(error);
    }
  });
});
