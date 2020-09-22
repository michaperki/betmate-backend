import mongoose from 'mongoose';
import supertest from 'supertest';
import server from '../../server';

const authPrefix = '/auth';
const request = supertest(server);

describe('Working auth router', () => {
  beforeAll(async () => {
    try {
      // Close app's connection to DB and reopen to testing DB
      await mongoose.connection.close();
      await mongoose.connect(global.__MONGO_URI__, { useNewUrlParser: true, useCreateIndex: true, useUnifiedTopology: true }, (err) => {
        if (err) {
          console.error(err);
          process.exit(1);
        }
      });
    } catch (error) {
      console.error(error);
      process.exit(1);
    }
  });

  afterAll(async () => {
    try {
      await mongoose.connection.close();
      server.close();
    } catch (error) {
      console.error(error);
      process.exit(1);
    }
  });

  describe('signup functionality', () => {
    it('rejects requests without an email address', async (done) => {
      try {
        const res = await request.post(`${authPrefix}/signup`).send({});
        expect(res.status).toBe(400);
        expect(res.body.message).toBe('Please enter a valid email address');
        done();
      } catch (error) {
        console.error(error);
        process.exit(1);
      }
    });

    it('creates and returns a valid new user', () => {

    });

    it('', () => {

    });
  });

  describe('signin functionality', () => {
    it('rejects incomplete or invalid requests', () => {
      // No email
      // No password
      // Invalid email
    });

    it('returns 401 on incorrect password', () => {

    });

    it('returns valid token and JSON user object', () => {

    });
  });
});
