import supertest from 'supertest';
import { stringify } from 'querystring';
import { chessRouter } from '../../routers';

import { GameSource, GameStatus, MoveData } from '../../types/models/chess';
import { Chess } from '../../models';
import { connectDB, dropDB } from '../../../__jest__/helpers';

const request = supertest(chessRouter);

/* -------- Set up data -------- */

const fillerMove: MoveData = {
  san: 'd4', from: 'd2', to: 'd4', time: 10, is_white: true,
};
// minimal fields
const chessDataA = {
  player_white: { name: 'playerA', elo: 200 },
  player_black: { name: 'playerB', elo: 400 },
  source: GameSource.STATIC,
};

// all fields
const chessDataB = {
  state: 'r2qkbnr/pppbp1pp/2n2p2/1B1p4/3P1B2/4P3/PPP2PPP/RN1QK1NR w KQkq - 0 1',
  complete: false,
  time_format: '900+10',
  game_status: GameStatus.IN_PROGRESS,
  player_white: { name: 'playerC', elo: 1200 },
  player_black: { name: 'playerD', elo: 1400 },
  source: GameSource.STATIC,
  move_hist: [fillerMove, fillerMove, fillerMove, fillerMove, fillerMove, fillerMove, fillerMove, fillerMove],
  time_white: 293,
  time_black: 291,
};

let validID = '';
const invalidID = 'invalidID';

/* -------- Helper function -------- */

const validateBody = (body: any) => {
  expect(body.state).toBeDefined();
  expect(body.time_format).toBeDefined();
  expect(body.complete).toBeDefined();
  expect(body.game_status).toBeDefined();
  expect(body.move_hist).toBeDefined();
  expect(body.time_white).toBeDefined();
  expect(body.time_black).toBeDefined();
  expect(body.player_white).toBeDefined();
  expect(body.player_black).toBeDefined();
  expect(body.created_at).toBeDefined();
  expect(body.updated_at).toBeDefined();
  expect(body.odds.white_win).toBeDefined();
  expect(body.odds.draw).toBeDefined();
  expect(body.odds.black_win).toBeDefined();
  expect(body.pool_wagers.move).toBeDefined();
  expect(body.pool_wagers.move.options).toBeDefined();
  expect(body.pool_wagers.move.wagers).toBeDefined();
  expect(body._id).toBeDefined();
  expect(body.__v).toBeUndefined();
};

// Mocks requireAuth server middleware
jest.mock('authentication/requireAuth');

/* -------- Tests -------- */

describe('Working chess router', () => {
  beforeAll(async (done) => {
    try {
      connectDB(done);
    } catch (error) {
      done(error);
    }
  });

  beforeAll(async (done) => {
    try {
      const game = await new Chess(chessDataA).save();
      validID = game._id;
      await new Chess(chessDataB).save();
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

  describe('single game modification', () => {
    describe('fetch one', () => {
      it("catches resource doesn't exist", async (done) => {
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
      it('blocks if query fields are invalid', async (done) => {
        try {
          const query = stringify({
            game_status: 'started', // not a valid GameStatus
            complete: 'done', // should be boolean
            player_white: 'playerA', // not allowed
            player_black: 'playerB', // not allowed
            state: 'someFEN', // not allowed
            move_hist: 2.4, // not allowed
            wagers: 25, // not allowed
            time_white: 10, // not allowed
            time_black: 10, // not allowed
            _id: 'gameID', // not allowed
            created_at: Date.now(), // not allowed
            updated_at: Date.now(), // not allowed
            __v: 0, // not allowed
          });

          const res = await request.get(`?${query}`);

          expect(res.status).toBe(400);
          expect(res.body.errors.length).toBe(13);
          expect(res.body.errors).toContain("The values 'started' are not game statuses");
          expect(res.body.errors).toContain("'complete' must be a boolean");
          expect(res.body.errors).toContain("'player_white' is not allowed");
          expect(res.body.errors).toContain("'player_black' is not allowed");
          expect(res.body.errors).toContain("'state' is not allowed");
          expect(res.body.errors).toContain("'move_hist' is not allowed");
          expect(res.body.errors).toContain("'wagers' is not allowed");
          expect(res.body.errors).toContain("'time_white' is not allowed");
          expect(res.body.errors).toContain("'time_black' is not allowed");
          expect(res.body.errors).toContain("'_id' is not allowed");
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
          const res = await request.get('/');

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
