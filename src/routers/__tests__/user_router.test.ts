import supertest from 'supertest';
import { userRouter } from 'routers';

import { Users } from 'models';
import {
  mockUser, connectDB, dropDB,
} from '../../../__jest__/helpers';

// eslint-disable-next-line @typescript-eslint/naming-convention, no-unused-vars
const { _id, ...userData } = mockUser;

const request = supertest(userRouter);

// Mocks requireAuth server middleware
jest.mock('authentication/requireAuth');

describe('Working user router', () => {
  beforeAll(async (done) => {
    try {
      connectDB(done);
    } catch (error) {
      done(error);
    }
  });

  beforeAll(async (done) => {
    try {
      await new Users(mockUser).save();

      await new Users({ ...userData, email: 'test2@test.com' }).save();
      await new Users({ ...userData, email: 'test3@test.com' }).save();
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

  describe('single event modification', () => {
    describe('fetch one', () => {
      // * NOTE: Can require multiple checks depending on number of user permission levels
      it('requires valid permissions', async (done) => {
        try {
          const res = await request
            .get('/')
            .send(mockUser);

          expect(res.status).toBe(401);
          done();
        } catch (error) {
          done(error);
        }
      });

      it('succeeds with sensitive information removed', async (done) => {
        try {
          const res = await request
            .get('/')
            .set('Authorization', 'Bearer dummy_token');

          expect(res.status).toBe(200);
          expect(res.body._id).toBeDefined();
          expect(res.body.password).toBeUndefined();
          done();
        } catch (error) {
          done(error);
        }
      });
    });

    describe('update one', () => {
      // * NOTE: Can require multiple checks depending on number of user permission levels
      it('requires valid permissions', async (done) => {
        try {
          const res = await request
            .put('/')
            .send(mockUser);

          expect(res.status).toBe(401);
          done();
        } catch (error) {
          done(error);
        }
      });

      // * NOTE: Can require multiple checks depending on number of required fields
      // it('requires valid data', async (done) => {

      // });

      // * NOTE: Can require multiple checks depending on number of non-unique fields
      // it('blocks creation of resource with non-unique field', async (done) => {

      // });

      it('succeeds with sensitive information removed', async (done) => {
        try {
          const res = await request
            .put('/')
            .set('Authorization', 'Bearer dummy_token')
            .send({ first_name: 'Not Joe' });

          expect(res.status).toBe(200);
          expect(res.body.first_name).toBe('Not Joe');
          expect(res.body.password).toBeUndefined();
          done();
        } catch (error) {
          done(error);
        }
      });
    });

    describe('delete one', () => {
      // * NOTE: Can require multiple checks depending on number of user permission levels
      it('requires valid permissions', async (done) => {
        try {
          const res = await request.delete('/')
            .send(mockUser);

          expect(res.status).toBe(401);
          done();
        } catch (error) {
          done(error);
        }
      });

      it('succeeds', async (done) => {
        try {
          const res = await request
            .delete('/')
            .set('Authorization', 'Bearer dummy_token');

          expect(res.status).toBe(200);
          done();
        } catch (error) {
          done(error);
        }
      });
    });
  });

  describe('batch event modification', () => {
    // * NOTE: Currently unimplemented
    // describe('create multiple', () => {
    //   // * NOTE: Can require multiple checks depending on number of user permission levels
    //   // it('requires valid permissions', async (done) => {

    //   // });

    //   // * NOTE: Can require multiple checks depending on number of required fields
    //   // it('requires valid data', async (done) => {

    //   // });

    //   // * NOTE: Can require multiple checks depending on number of non-unique fields
    //   // it('blocks creation of resource with non-unique field', async (done) => {

    //   // });

    //   it('succeeds', async (done) => {

    //   });
    // });

    describe('fetch multiple', () => {
      // * NOTE: Can require multiple checks depending on number of user permission levels
      it('requires valid permissions', async (done) => {
        try {
          const res = await request
            .get('/all')
            .send(mockUser);

          expect(res.status).toBe(401);
          done();
        } catch (error) {
          done(error);
        }
      });

      // * NOTE: Requires multiple checks
      // it('valid pagination', async (done) => {

      // });

      // * NOTE: Not needed with only GET ALL functionality
      // it('catches resource doesn\'t exist', async (done) => {

      // });

      it('succeeds', async (done) => {
        try {
          const res = await request
            .get('/all')
            .set('Authorization', 'Bearer dummy_token');

          expect(res.status).toBe(200);
          expect(res.body.length).toBe(2);
          expect(res.body[0]).toBeDefined();
          done();
        } catch (error) {
          done(error);
        }
      });
    });

    // * NOTE: Currently unimplemented
    // describe('update multiple', () => {
    //   // * NOTE: Can require multiple checks depending on number of user permission levels
    //   // it('requires valid permissions', async (done) => {

    //   // });

    //   // * NOTE: Can require multiple checks depending on number of required fields
    //   // it('requires valid data', async (done) => {

    //   // });

    //   // * NOTE: Can require multiple checks depending on number of non-unique fields
    //   // it('blocks creation of resource with non-unique field', async (done) => {

    //   // });

    //   it('catches resource doesn\'t exist', async (done) => {

    //   });

    //   it('succeeds', async (done) => {

    //   });
    // });

    // ! IMPORTANT: This is commented out
    // describe('delete multiple', () => {
    //   // * NOTE: Can require multiple checks depending on number of user permission levels
    //   it('requires valid permissions', async (done) => {
    //     try {
    //       const res = await request.delete('/');

    //       expect(res.status).toBe(401);
    //       done();
    //     } catch (error) {
    //       done(error);
    //     }
    //   });

    //   // * NOTE: Not needed with only DELETE ALL functionality
    //   // it('catches resource doesn\'t exist', async (done) => {

    //   // });

    //   it('succeeds', async (done) => {
    //     try {
    //       const res = await request.delete('/')
    //         .set('Authorization', 'Bearer dummy_token');

    //       expect(res.status).toBe(200);
    //       done();
    //     } catch (error) {
    //       done(error);
    //     }
    //   });
    // });
  });
});
