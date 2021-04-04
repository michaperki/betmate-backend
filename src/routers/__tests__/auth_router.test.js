import supertest from 'supertest';

import authRouter from '../auth_router';
import { mockUser, connectDB, dropDB } from '../../../__jest__/helpers';

const request = supertest(authRouter);

describe('Working auth router', () => {
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

  describe('signup functionality', () => {
    it('rejects requests without an email address', async (done) => {
      try {
        const res = await request.post('/signup').send({});
        expect(res.status).toBe(400);
        expect(res.body.message).toBe('Please enter a valid email address');
        done();
      } catch (error) {
        done(error);
      }
    });

    it('rejects requests without a valid email address', async (done) => {
      try {
        const res = await request.post('/signup').send({ email: 'this is an invalid email' });
        expect(res.status).toBe(400);
        expect(res.body.message).toBe('Please enter a valid email address');
        done();
      } catch (error) {
        done(error);
      }
    });

    it('rejects requests without a password', async (done) => {
      try {
        const res = await request.post('/signup').send({ email: mockUser.email });
        expect(res.status).toBe(400);
        expect(res.body.message).toBe('Missing required "password" field');
        done();
      } catch (error) {
        done(error);
      }
    });

    it('creates and returns a new user JSON object', async (done) => {
      try {
        const res = await request.post('/signup').send(mockUser);
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
        const res = await request.post('/signup').send(mockUser);
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
        const res = await request.post('/signin').send({});
        expect(res.status).toBe(400);
        expect(res.body.message).toBe('Missing required "email" field');
        done();
      } catch (error) {
        done(error);
      }
    });

    it('rejects requests without a password', async (done) => {
      try {
        const res = await request.post('/signin').send({ email: mockUser.email });
        expect(res.status).toBe(400);
        expect(res.body.message).toBe('Missing required "password" field');
        done();
      } catch (error) {
        done(error);
      }
    });

    it('rejects emails with no associated users', async (done) => {
      try {
        const res = await request.post('/signin').send({ email: 'not an email', password: mockUser.password });
        expect(res.status).toBe(401);
        expect(res.body.message).toBe('Email address not associated with a user');
        done();
      } catch (error) {
        done(error);
      }
    });

    it('returns 401 on incorrect password', async (done) => {
      try {
        const res = await request.post('/signin').send({ email: mockUser.email, password: 'wrong password' });
        expect(res.status).toBe(401);
        expect(res.body.message).toBe('Incorrect password');
        done();
      } catch (error) {
        done(error);
      }
    });

    it('returns valid token and JSON user object', async (done) => {
      try {
        const res = await request.post('/signin').send(mockUser);
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
