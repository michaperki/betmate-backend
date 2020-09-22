import * as bcrypt from 'bcrypt';
import mongoose from 'mongoose';
import UserModel from '../user_model';

const userData = {
  email: 'test@test.com',
  password: 'password',
  first_name: 'Joe',
  last_name: 'Smith',
  resource: null,
};

describe('User Model validation', () => {
  // Connect DB before running tests
  beforeAll(async () => {
    await mongoose.connect(global.__MONGO_URI__, { useNewUrlParser: true, useCreateIndex: true, useUnifiedTopology: true }, (err) => {
      if (err) {
        console.error(err);
        process.exit(1);
      }
    });
  });

  // // Clean DB after each test
  // afterEach(async () => {
  //   UserModel.deleteMany();
  // });

  // Close DB connection
  afterAll(async () => {
    try {
      await mongoose.connection.close();
    } catch (error) {
      console.error(error);
      process.exit(1);
    }
  });

  it('creates and saves a user successfully', async () => {
    try {
      // Creates a new user object
      const validUser = new UserModel(userData);
      const savedUser = await validUser.save();

      // Checks user has been saved to testing DB
      expect(savedUser._id).toBeDefined();
      expect(savedUser.email).toBe(userData.email);
      expect(savedUser.first_name).toBe(userData.first_name);
      expect(savedUser.last_name).toBe(userData.last_name);
      expect(savedUser.resource).toBe(null);

      // Compares hashed to expected password
      let passCompareResult = false;
      passCompareResult = await new Promise((resolve, reject) => {
        bcrypt.compare(userData.password, savedUser.password, (err, result) => { if (err) { reject(err); } resolve(result); });
      });
      expect(passCompareResult).toBe(true);
    } catch (error) {
      console.error(error);
      process.exit(1);
    }
  });

  it('blocks users without required fields', async () => {
    try {
      // Creates a new user object
      const invalidUser = new UserModel({}); // Needs email, password

      const savedUser = await new Promise((resolve, reject) => {
        invalidUser.save().then((user) => {
          reject(user);
        }).catch((err) => {
          resolve(err);
        });
      });

      expect(savedUser._message).toBe('User validation failed');
      expect(savedUser.message).toBe('User validation failed: password: Path `password` is required., email: Path `email` is required.');
    } catch (error) {
      console.error(error);
      process.exit(1);
    }
  });

  it('loads virtuals correctly', async () => {
    try {
      const users = await UserModel.find({});
      expect(users[0].full_name).toBe(`${userData.first_name} ${userData.last_name}`);
    } catch (error) {
      console.error(error);
      process.exit(1);
    }
  });
});
