import mongoose from 'mongoose';
import supertest from 'supertest';

import server from '../../server';
import UserModel from '../../models/user_model';

const authPrefix = '/auth';
const request = supertest(server);
const userData = {
  email: 'test@test.com',
  password: 'password',
};

describe('Working auth router', () => {
  beforeAll(async (done) => {
    try {
      // Close app's connection to DB and reopen to testing DB
      await mongoose.connection.close();
      await mongoose.connect(global.__MONGO_URI__, { useNewUrlParser: true, useCreateIndex: true, useUnifiedTopology: true }, (err) => {
        if (err) done(err);
      });

      // Clear `users` testing DB field to prevent unintended duplicates
      await UserModel.deleteMany();
      done();
    } catch (error) {
      done(error);
    }
  });

  afterAll(async (done) => {
    try {
      await mongoose.connection.close();
      server.close();
      done();
    } catch (error) {
      done(error);
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
        done(error);
      }
    });

    it('rejects requests without a valid email address', async (done) => {
      try {
        const res = await request.post(`${authPrefix}/signup`).send({ email: 'this is an invalid email' });
        expect(res.status).toBe(400);
        expect(res.body.message).toBe('Please enter a valid email address');
        done();
      } catch (error) {
        done(error);
      }
    });

    it('rejects requests without a password', async (done) => {
      try {
        const res = await request.post(`${authPrefix}/signup`).send({ email: userData.email });
        expect(res.status).toBe(400);
        expect(res.body.message).toBe('Please enter a password');
        done();
      } catch (error) {
        done(error);
      }
    });

    it('creates and returns a new user JSON object', async (done) => {
      try {
        const res = await request.post(`${authPrefix}/signup`).send(userData);
        expect(res.status).toBe(201);
        expect(res.body.token).toBeDefined();
        expect(res.body.user).toBeDefined();
        done();
      } catch (error) {
        done(error);
      }
    });

    it('rejects requests with a non-unique email address', async (done) => {
      try {
        const res = await request.post(`${authPrefix}/signup`).send(userData);
        expect(res.status).toBe(409);
        expect(res.body.message).toBe('Email address already associated to a user');
        done();
      } catch (error) {
        done(error);
      }
    });
  });

  describe('signin functionality', () => {
    it('rejects requests without an email address', async (done) => {
      try {
        const res = await request.post(`${authPrefix}/signin`).send({});
        expect(res.status).toBe(400);
        expect(res.body.message).toBe('Email address not included');
        done();
      } catch (error) {
        done(error);
      }
    });

    it('rejects requests without a password', async (done) => {
      try {
        const res = await request.post(`${authPrefix}/signin`).send({ email: userData.email });
        expect(res.status).toBe(400);
        expect(res.body.message).toBe('Password not included');
        done();
      } catch (error) {
        done(error);
      }
    });

    it('rejects emails with no associated users', async (done) => {
      try {
        const res = await request.post(`${authPrefix}/signin`).send({ email: 'not an email', password: userData.password });
        expect(res.status).toBe(401);
        expect(res.body.message).toBe('Email address not associated with a user');
        done();
      } catch (error) {
        done(error);
      }
    });

    it('returns 401 on incorrect password', async (done) => {
      try {
        const res = await request.post(`${authPrefix}/signin`).send({ email: userData.email, password: 'wrong password' });
        expect(res.status).toBe(401);
        expect(res.body.message).toBe('Incorrect password');
        done();
      } catch (error) {
        done(error);
      }
    });

    it('returns valid token and JSON user object', async (done) => {
      try {
        const res = await request.post(`${authPrefix}/signin`).send(userData);
        expect(res.status).toBe(200);
        expect(res.body.token).toBeDefined();
        expect(res.body.user).toBeDefined();
        done();
      } catch (error) {
        done(error);
      }
    });
  });
});
