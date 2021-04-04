import supertest from 'supertest';
import resourceRouter from '../resource_router';

const {
  connectDB, dropDB,
} = require('../../../__jest__/helpers');

const request = supertest(resourceRouter);

const resourceData = {
  title: 'Test title',
  description: 'This is a test description',
  value: 3,
};

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
            .send(resourceData);

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
        it('blocks resource creation when missing title', async (done) => {
          try {
            const res = await request.post('/')
              .set('Authorization', 'Bearer dummy_token')
              .send({ description: resourceData.description, value: resourceData.value });

            expect(res.status).toBe(400);
            expect(res.body.message).toBe('Missing required "title" field');
            done();
          } catch (error) {
            done(error);
          }
        });

        it('blocks resource creation when missing description', async (done) => {
          try {
            const res = await request.post('/')
              .set('Authorization', 'Bearer dummy_token')
              .send({ title: resourceData.title, value: resourceData.value });

            expect(res.status).toBe(400);
            expect(res.body.message).toBe('Missing required "description" field');
            done();
          } catch (error) {
            done(error);
          }
        });

        it('blocks resource creation when missing value', async (done) => {
          try {
            const res = await request.post('/')
              .set('Authorization', 'Bearer dummy_token')
              .send({ title: resourceData.title, description: resourceData.description });

            expect(res.status).toBe(400);
            expect(res.body.message).toBe('Missing required "value" field');
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
            .send(resourceData);

          expect(res.status).toBe(201);

          // Resource exists with all required fields
          expect(res.body.title).toBeDefined();
          expect(res.body.description).toBeDefined();
          expect(res.body.value).toBeDefined();
          expect(res.body.date_resource_created).toBeDefined();
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
      // it('requires valid permissions', async (done) => {

      // });

      it('catches resource doesn\'t exist', async (done) => {
        try {
          const res = await request.get(`/${invalidId}`);
          expect(res.status).toBe(404);
          expect(res.body.message).toBe('Couldn\'t find resource with given id');
          done();
        } catch (error) {
          done(error);
        }
      });

      it('succeeds', async (done) => {
        try {
          const res = await request.get(`/${validId}`);
          expect(res.status).toBe(200);
          expect(res.body._id).toBeDefined();
          done();
        } catch (error) {
          done(error);
        }
      });
    });

    describe('update one', () => {
      // * NOTE: Can require multiple checks depending on number of user permission levels
      // it('requires valid permissions', async (done) => {

      // });

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

      it('succeeds', async (done) => {
        try {
          const res = await request.put(`/${validId}`)
            .set('Authorization', 'Bearer dummy_token')
            .send({ title: 'New title' });

          expect(res.status).toBe(200);
          expect(res.body.title).toBe('New title');
          done();
        } catch (error) {
          done(error);
        }
      });
    });

    describe('delete one', () => {
      // * NOTE: Can require multiple checks depending on number of user permission levels
      // it('requires valid permissions', async (done) => {

      // });

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
      // it('requires valid permissions', async (done) => {

      // });

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
            .send(resourceData);

          await request.post('/')
            .set('Authorization', 'Bearer dummy_token')
            .send(resourceData);

          const res = await request.get('/');
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
    //   // it('requires valid permissions', async (done) => {

    //   // });

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
