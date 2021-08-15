import supertest from 'supertest';
import { stringify } from 'querystring';

import { Chess, Wager, Users } from 'models';
import { wagerRouter } from 'routers';

import { documentNotFoundError } from 'helpers/constants';
import { GameSource, GameStatus, MoveData } from 'types/models/chess';
import { connectDB, dropDB, mockUser } from '../../../__jest__/helpers';

const request = supertest(wagerRouter);

/* -------- Set up data -------- */

const fillerMove: MoveData = {
  san: 'd4', from: 'd2', to: 'd4', time: 0, is_white: true,
};

const chessData = {
  state: 'r2qkbnr/pppbp1pp/2n2p2/1B1p4/3P1B2/4P3/PPP2PPP/RN1QK1NR w KQkq - 0 1',
  complete: false,
  game_status: GameStatus.IN_PROGRESS,
  source: GameSource.STATIC,
  player_white: { name: 'playerC', elo: 1200 },
  player_black: { name: 'playerD', elo: 1400 },
  move_hist: [fillerMove, fillerMove, fillerMove, fillerMove, fillerMove, fillerMove, fillerMove, fillerMove],
  time_white: 93,
  time_black: 91,
};

const wagerData = {
  odds: 1 / 0.6193755739210285,
  wdl: true,
  amount: 10,
  data: 'white_win',
  move_number: 9,
};

const badWagerData = {
  odds: 0.5, // needs to be greater than 1
  wdl: true,
  amount: -10, // needs to be positive
  data: 'black_win',
  move_number: -10, // needs to be positive
};

let validID = '';
const invalidID = 'invalidID';
let chessGameID = '';

const validateBody = (body: any) => {
  expect(body.game_id).toBeDefined();
  expect(body.better_id).toBeDefined();
  expect(body.wdl).toBeDefined();
  expect(body.amount).toBeDefined();
  expect(body.odds).toBeDefined();
  expect(body.data).toBeDefined();
  expect(body.move_number).toBeDefined();
  expect(body.resolved).toBeDefined();
  expect(body.winning_pool_share).toBeDefined();
  expect(body.created_at).toBeDefined();
  expect(body.updated_at).toBeDefined();
  expect(body._id).toBeDefined();
  expect(body.__v).toBeUndefined();
};

// Mocks requireAuth server middleware
jest.mock('authentication/requireAuth');

/* -------- Tests -------- */

describe('Working wager router', () => {
  beforeAll(async (done) => {
    try {
      await connectDB(done);
    } catch (error) {
      done(error);
    }
  });

  beforeAll(async (done) => {
    try {
      await new Users(mockUser).save();

      const chessGame = await new Chess(chessData).save();
      chessGameID = chessGame._id;

      const wager = await new Wager({
        ...wagerData,
        better_id: mockUser._id,
        game_id: chessGameID,
      }).save();

      validID = wager._id;
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

  describe('single wager modification', () => {
    describe('create one', () => {
      it('requires valid permissions', async (done) => {
        try {
          const res = await request
            .post(`/${chessGameID}`)
            .send(wagerData);

          expect(res.status).toBe(401);
          expect(res.body.message).toBe('Error authenticating email and password');
          done();
        } catch (error) {
          done(error);
        }
      });

      it('blocks wager creation if game is non-existant', async (done) => {
        try {
          const res = await request
            .post('/randomgameid')
            .set('Authorization', 'Bearer dummy_token')
            .send(wagerData);

          expect(res.status).toBe(404);
          expect(res.body.errors.length).toBe(1);
          expect(res.body.errors).toContain(documentNotFoundError);
          done();
        } catch (error) {
          done(error);
        }
      });

      describe('blocks creation of wager with invalid field', () => {
        it('blocks wager creation without requried fields', async (done) => {
          try {
            const res = await request
              .post(`/${chessGameID}`)
              .set('Authorization', 'Bearer dummy_token')
              .send({});

            expect(res.status).toBe(400);
            expect(res.body.errors.length).toBe(5);
            expect(res.body.errors).toContain("'wdl' is required");
            expect(res.body.errors).toContain("'data' is required");
            expect(res.body.errors).toContain("'amount' is required");
            expect(res.body.errors).toContain("'odds' is required");
            expect(res.body.errors).toContain("'move_number' is required");

            done();
          } catch (error) {
            done(error);
          }
        });

        it('blocks wager creation when fields are invalid', async (done) => {
          try {
            const res = await request
              .post(`/${chessGameID}`)
              .set('Authorization', 'Bearer dummy_token')
              .send(badWagerData);

            expect(res.status).toBe(400);
            expect(res.body.errors.length).toBe(3);
            expect(res.body.errors).toContain("'amount' must be greater than or equal to 0.01");
            expect(res.body.errors).toContain("'odds' must be greater than or equal to 1");
            expect(res.body.errors).toContain("'move_number' must be greater than or equal to 0");
            done();
          } catch (error) {
            done(error);
          }
        });
      });

      it('succeeds', async (done) => {
        try {
          const res = await request
            .post(`/${chessGameID}`)
            .set('Authorization', 'Bearer dummy_token')
            .send(wagerData);

          expect(res.status).toBe(200);
          validateBody(res.body);

          done();
        } catch (error) {
          done(error);
        }
      });
    });

    describe('fetch one', () => {
      it('requires valid permissions', async (done) => {
        try {
          const res = await request
            .get(`/${validID}`)
            .send(wagerData);

          expect(res.status).toBe(401);
          expect(res.body.message).toBe('Error authenticating email and password');
          done();
        } catch (error) {
          done(error);
        }
      });

      it("catches resource doesn't exist", async (done) => {
        try {
          const res = await request
            .get(`/${invalidID}`)
            .set('Authorization', 'Bearer dummy_token');

          expect(res.status).toBe(404);
          expect(res.body.errors.length).toBe(1);
          expect(res.body.errors).toContain(documentNotFoundError);
          done();
        } catch (error) {
          done(error);
        }
      });

      it('succeeds', async (done) => {
        try {
          const res = await request
            .get(`/${validID}`)
            .set('Authorization', 'Bearer dummy_token');

          expect(res.status).toBe(200);
          validateBody(res.body);
          done();
        } catch (error) {
          done(error);
        }
      });
    });
  });

  describe('batch event modification', () => {
    describe('fetch multiple', () => {
      it('requires valid permissions', async (done) => {
        try {
          const res = await request
            .get('/')
            .send(wagerData);

          expect(res.status).toBe(401);
          expect(res.body.message).toBe('Error authenticating email and password');
          done();
        } catch (error) {
          done(error);
        }
      });

      it('blocks if query fields are invalid', async (done) => {
        try {
          const query = stringify({
            resolved: 6, // should be boolean
            wdl: 'draw', // should be boolean
            game_id: 'randomID', // not valid id
            _id: 'wagerID', // not allowed
            better_id: 'userID', // not allowed
            odds: 2.4, // not allowed
            amount: 25, // not allowed
            move_number: 10, // not allowed
            status: 'waiting', // not of type enum
            created_at: Date.now(), // not allowed
            updated_at: Date.now(), // not allowed
            __v: 0, // not allowed
          });

          const res = await request
            .get(`?${query}`)
            .set('Authorization', 'Bearer dummy_token');

          expect(res.status).toBe(400);
          expect(res.body.errors.length).toBe(12);
          expect(res.body.errors).toContain("'resolved' must be a boolean");
          expect(res.body.errors).toContain("'wdl' must be a boolean");
          expect(res.body.errors).toContain("'game_id' is not valid");
          expect(res.body.errors).toContain("The values 'waiting' are not wager statuses");
          expect(res.body.errors).toContain("'_id' is not allowed");
          expect(res.body.errors).toContain("'better_id' is not allowed");
          expect(res.body.errors).toContain("'odds' is not allowed");
          expect(res.body.errors).toContain("'amount' is not allowed");
          expect(res.body.errors).toContain("'move_number' is not allowed");
          expect(res.body.errors).toContain("'created_at' is not allowed");
          expect(res.body.errors).toContain("'updated_at' is not allowed");
          expect(res.body.errors).toContain("'__v' is not allowed");

          done();
        } catch (error) {
          done(error);
        }
      });

      it('succeeds', async (done) => {
        try {
          const res = await request
            .get('/')
            .set('Authorization', 'Bearer dummy_token');

          expect(res.status).toBe(200);
          expect(res.body.length).toBe(2);
          validateBody(res.body[0]);
          validateBody(res.body[1]);
          done();
        } catch (error) {
          done(error);
        }
      });
    });
  });
});
