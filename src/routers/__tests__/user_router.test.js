import supertest from 'supertest';
import userRouter from '../user_router';

import {
  mockUser, connectDB, dropDB,
} from '../../../__jest__/helpers';

const request = supertest(userRouter);

let validId = '';
const invalidId = 'invalidId';

// Mocks requireAuth server middleware
jest.mock('../../authentication/requireAuth');

describe('Working resource router', () => {
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

  describe('single event modification', () => {
    describe('create one', () => {
      // * NOTE: Can require multiple checks depending on number of user permission levels
      it('requires valid permissions', async (done) => {
        try {
          const res = await request.post('/')
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
      describe('blocks creation of resource with non-unique field', () => {
        it('blocks resource creation when missing email', async (done) => {
          try {
            const res = await request.post('/')
              .set('Authorization', 'Bearer dummy_token')
              .send({ password: mockUser.password });

            expect(res.status).toBe(400);
            expect(res.body.message).toBe('Missing required "email" field');
            done();
          } catch (error) {
            done(error);
          }
        });

        it('blocks resource creation when missing password', async (done) => {
          try {
            const res = await request.post('/')
              .set('Authorization', 'Bearer dummy_token')
              .send({ email: mockUser.email });

            expect(res.status).toBe(400);
            expect(res.body.message).toBe('Missing required "password" field');
            done();
          } catch (error) {
            done(error);
          }
        });
      });

      it('succeeds', async (done) => {
        try {
          const res = await request.post('/')
            .set('Authorization', 'Bearer dummy_token')
            .send(mockUser);

          expect(res.status).toBe(201);

          // Resource exists with all required fields
          expect(res.body.first_name).toBeDefined();
          expect(res.body.last_name).toBeDefined();
          expect(res.body.email).toBeDefined();
          expect(res.body._id).toBeDefined();

          validId = res.body._id;
          done();
        } catch (error) {
          done(error);
        }
      });
    });

    describe('fetch one', () => {
      // * NOTE: Can require multiple checks depending on number of user permission levels
      it('requires valid permissions', async (done) => {
        try {
          const res = await request.get(`/${validId}`)
            .send(mockUser);

          expect(res.status).toBe(401);
          done();
        } catch (error) {
          done(error);
        }
      });

      it('catches resource doesn\'t exist', async (done) => {
        try {
          const res = await request.get(`/${invalidId}`)
            .set('Authorization', 'Bearer dummy_token');

          expect(res.status).toBe(404);
          expect(res.body.message).toBe('Couldn\'t find resource with given id');
          done();
        } catch (error) {
          done(error);
        }
      });

      it('succeeds with sensitive information removed', async (done) => {
        try {
          const res = await request.get(`/${validId}`)
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
          const res = await request.put(`/${validId}`)
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

      it('catches resource doesn\'t exist', async (done) => {
        try {
          const res = await request.put(`/${invalidId}`)
            .set('Authorization', 'Bearer dummy_token')
            .send({ title: 'New title' });

          expect(res.status).toBe(404);
          expect(res.body.message).toBe('Couldn\'t find resource with given id');
          done();
        } catch (error) {
          done(error);
        }
      });

      it('succeeds with sensitive information removed', async (done) => {
        try {
          const res = await request.put(`/${validId}`)
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
          const res = await request.delete(`/${validId}`)
            .send(mockUser);

          expect(res.status).toBe(401);
          done();
        } catch (error) {
          done(error);
        }
      });

      it('catches resource doesn\'t exist', async (done) => {
        try {
          const res = await request.delete(`/${invalidId}`)
            .set('Authorization', 'Bearer dummy_token');

          expect(res.status).toBe(404);
          expect(res.body.message).toBe('Couldn\'t find resource with given id');
          done();
        } catch (error) {
          done(error);
        }
      });

      it('succeeds', async (done) => {
        try {
          const res = await request.delete(`/${validId}`)
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
          const res = await request.get('/')
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
          // Create two new resources
          await request.post('/')
            .set('Authorization', 'Bearer dummy_token')
            .send({ email: 'test1@test.com', password: mockUser.password });

          await request.post('/')
            .set('Authorization', 'Bearer dummy_token')
            .send({ email: 'test2@test.com', password: mockUser.password });

          const res = await request.get('/')
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
