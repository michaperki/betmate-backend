import supertest from 'supertest';
import chessRouter from '../chess_router';

import { connectDB, dropDB } from '../../../__jest__/helpers';
import { GameStatus } from '../../helpers/constants';

const request = supertest(chessRouter);

// minimal fields
const chessDataA = {
  player_white: 'playerA',
  player_black: 'playerB',
};

// all fields
const chessDataB = {
  state: 'r2qkbnr/pppbp1pp/2n2p2/1B1p4/3P1B2/4P3/PPP2PPP/RN1QK1NR w KQkq - 0 1',
  complete: false,
  game_status: GameStatus.IN_PROGRESS,
  player_white: 'playerC',
  player_black: 'playerD',
  move_hist: ['d4', 'd5', 'Bf4', 'Nc6', 'e3', 'f6', 'Bb5', 'Bd7'],
  wagers: [],
  time_white: 293,
  time_black: 291,
};

// invalid game
const badChessData = {
  state: 'r2qkbnr/pppbp1pp/2n2p3P1B2/4P3/PPP2PPP/RN1QK1NR w KQkq - 0 1', // bad fen
  game_status: 'begun', // Not in enum GameStatus
  wagers: ['fakeWagerID'], // Not a real id for wager
  time_white: -10, // Should be positive
  time_black: -10, // Should be positive
  player_white: 'playerA',
  player_black: 'playerB',
};

let validID = '';
const invalidID = 'invalidID';

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

  describe('single game modification', () => {
    describe('create one', () => {
      // * NOTE: Can require multiple checks depending on number of required fields
      // it('requires valid data', async (done) => {

      // });

      // * NOTE: Can require multiple checks depending on number of non-unique fields
      describe('blocks creation of resource with invalid field', () => {
        it('blocks chess game creation when player fields', async (done) => {
          try {
            const res = await request.post('/')
              .send({});

            expect(res.status).toBe(400);
            expect(res.body.errors[0].msg).toBe("'player_white' is required with type string");
            expect(res.body.errors[1].msg).toBe("'player_black' is required with type string");

            done();
          } catch (error) {
            done(error);
          }
        });

        it('blocks resource creation when chess state in invalid FEN notation', async (done) => {
          try {
            const res = await request.post('/')
              .send({ ...chessDataA, state: 'badFEN' });

            expect(res.status).toBe(400);
            expect(res.body.errors[0].msg).toBe('FEN string must contain six space-delimited fields');
            done();
          } catch (error) {
            done(error);
          }
        });

        it('blocks resource creation with invalid game status', async (done) => {
          try {
            const res = await request.post('/')
              .send({ ...chessDataA, game_status: 'winning' });

            expect(res.status).toBe(400);
            expect(res.body.errors[0].msg).toBe("Value 'winning' is not a game status");
            done();
          } catch (error) {
            done(error);
          }
        });

        it('blocks resource creation with invalid times', async (done) => {
          try {
            const res = await request.post('/')
              .send({ ...chessDataA, time_white: -10, time_black: -20 });

            expect(res.status).toBe(400);
            expect(res.body.errors[0].msg).toBe("'time_white' must be at least 0");
            expect(res.body.errors[1].msg).toBe("'time_black' must be at least 0");
            done();
          } catch (error) {
            done(error);
          }
        });
      });

      describe('successfully creates chess game', () => {
        it('succeeds with minimal fields', async (done) => {
          try {
            const res = await request.post('/')
              .send(chessDataA);

            expect(res.status).toBe(200);

            // Resource exists with all required fields
            expect(res.body.state).toBeDefined();
            expect(res.body.complete).toBeDefined();
            expect(res.body.game_status).toBeDefined();
            expect(res.body.move_hist).toBeDefined();
            expect(res.body.wagers).toBeDefined();
            expect(res.body.time_white).toBeDefined();
            expect(res.body.time_black).toBeDefined();
            expect(res.body.player_white).toBeDefined();
            expect(res.body.player_black).toBeDefined();
            expect(res.body._id).toBeDefined();

            validID = res.body._id;

            done();
          } catch (error) {
            done(error);
          }
        });

        it('succeeds with all fields', async (done) => {
          try {
            const res = await request.post('/')
              .send(chessDataB);

            expect(res.status).toBe(200);

            // Resource exists with all required fields
            expect(res.body.state).toBeDefined();
            expect(res.body.complete).toBeDefined();
            expect(res.body.game_status).toBeDefined();
            expect(res.body.move_hist).toBeDefined();
            expect(res.body.wagers).toBeDefined();
            expect(res.body.time_white).toBeDefined();
            expect(res.body.time_black).toBeDefined();
            expect(res.body.player_white).toBeDefined();
            expect(res.body.player_black).toBeDefined();
            expect(res.body._id).toBeDefined();

            done();
          } catch (error) {
            done(error);
          }
        });
      });
    });

    describe('fetch one', () => {
      // * NOTE: Can require multiple checks depending on number of user permission levels
      // it('requires valid permissions', async (done) => {

      // });

      it('catches resource doesn\'t exist', async (done) => {
        try {
          const res = await request.get(`/${invalidID}`);
          expect(res.status).toBe(404);
          expect(res.body.errors[0]).toBe('Couldn\'t find resource with given id');
          done();
        } catch (error) {
          done(error);
        }
      });

      it('succeeds', async (done) => {
        try {
          const res = await request.get(`/${validID}`);
          expect(res.status).toBe(200);
          expect(res.body._id).toBeDefined();
          expect(res.body.state).toBeDefined();
          expect(res.body.complete).toBeDefined();
          expect(res.body.game_status).toBeDefined();
          expect(res.body.move_hist).toBeDefined();
          expect(res.body.wagers).toBeDefined();
          expect(res.body.time_white).toBeDefined();
          expect(res.body.time_black).toBeDefined();
          expect(res.body.player_white).toBeDefined();
          expect(res.body.player_black).toBeDefined();
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
          const res = await request.put(`/${invalidID}`)
            .send({ time_black: 40 });

          expect(res.status).toBe(404);
          expect(res.body.message).toBe('Couldn\'t find resource with given id');
          done();
        } catch (error) {
          done(error);
        }
      });

      it('succeeds', async (done) => {
        try {
          const res = await request.put(`/${validID}`)
            .send({ time_black: 40 });

          expect(res.status).toBe(200);
          expect(res.body.time_black).toBe(40);

          expect(res.body._id).toBeDefined();
          expect(res.body.state).toBeDefined();
          expect(res.body.complete).toBeDefined();
          expect(res.body.game_status).toBeDefined();
          expect(res.body.move_hist).toBeDefined();
          expect(res.body.wagers).toBeDefined();
          expect(res.body.time_white).toBeDefined();
          expect(res.body.time_black).toBeDefined();
          expect(res.body.player_white).toBeDefined();
          expect(res.body.player_black).toBeDefined();

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
  });
});
