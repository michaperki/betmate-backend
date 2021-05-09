import supertest from 'supertest';
import { stringify } from 'querystring';

import { Chess, Wager } from 'models';
import { wagerRouter } from 'routers';

import { documentNotFoundError } from 'helpers/constants';
import { GameStatus } from 'types/models';
import { connectDB, dropDB, mockUser } from '../../../__jest__/helpers';

const request = supertest(wagerRouter);

const chessData = {
  state: 'r2qkbnr/pppbp1pp/2n2p2/1B1p4/3P1B2/4P3/PPP2PPP/RN1QK1NR w KQkq - 0 1',
  complete: false,
  game_status: GameStatus.IN_PROGRESS,
  player_white: { name: 'playerC', elo: 1200 },
  player_black: { name: 'playerD', elo: 1400 },
  move_hist: ['d4', 'd5', 'Bf4', 'Nc6', 'e3', 'f6', 'Bb5', 'Bd7'],
  time_white: 293,
  time_black: 291,
};

const wagerData = {
  odds: 2.5,
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
  expect(body.winnings).toBeDefined();
  expect(body.created_at).toBeDefined();
  expect(body.updated_at).toBeDefined();
  expect(body._id).toBeDefined();
  expect(body.__v).toBeUndefined();
};

// Mocks requireAuth server middleware
jest.mock('authentication/requireAuth');

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
          expect(res.body.error).toBe(documentNotFoundError);
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
            expect(res.body.errors[0].msg).toBe("'wdl' is required with type boolean");
            expect(res.body.errors[1].msg).toBe("'data' is required with type string");
            expect(res.body.errors[2].msg).toBe("'amount' is required with type number");
            expect(res.body.errors[3].msg).toBe("'odds' is required with type number");
            expect(res.body.errors[4].msg).toBe("'move_number' is required with type number");

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
            expect(res.body.errors[0].msg).toBe("'amount' must be at least 0.01");
            expect(res.body.errors[1].msg).toBe("'odds' must be at least 1");
            expect(res.body.errors[2].msg).toBe("'move_number' must be at least 0");
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
          expect(res.body.error).toBe(documentNotFoundError);
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
          expect(res.body.errors[0].msg).toBe("'resolved' must be type boolean");
          expect(res.body.errors[1].msg).toBe("'wdl' must be type boolean");
          expect(res.body.errors[2].msg).toBe("'game_id' is not valid");
          expect(res.body.errors[3].msg).toBe("The values 'waiting' are not wager statuses");
          expect(res.body.errors[4].msg).toBe("Cannot search by '_id'");
          expect(res.body.errors[5].msg).toBe("Cannot search by 'better_id'");
          expect(res.body.errors[6].msg).toBe("Cannot search by 'odds'");
          expect(res.body.errors[7].msg).toBe("Cannot search by 'amount'");
          expect(res.body.errors[8].msg).toBe("Cannot search by 'move_number'");
          expect(res.body.errors[9].msg).toBe("Cannot search by '__v'");
          expect(res.body.errors[10].msg).toBe("Cannot search by 'created_at'");
          expect(res.body.errors[11].msg).toBe("Cannot search by 'updated_at'");

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
