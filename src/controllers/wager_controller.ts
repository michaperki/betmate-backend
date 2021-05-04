/* eslint-disable @typescript-eslint/naming-convention */
import { RequestHandler } from 'express';
import { documentNotFoundError } from 'helpers/constants';
import { WagerDoc } from 'types/models';
import { Wager, Chess, Users } from 'models';
import { RequestWithJWT } from 'types/requests';
import { requestWithValidation } from 'helpers/validation';
import { FilterQuery } from 'mongoose';

type WagerRequestBody = {
  wdl: boolean,
  amount: number,
  data: string,
  odds: number,
  move_number: number,
};

const getWager = (id: string): Promise<WagerDoc | null> => (
  Wager
    .findById(id)
    .then((doc) => doc)
    .catch(() => null)
);

const getUserWagers = (userID: string, fields: FilterQuery<WagerDoc>): Promise<WagerDoc[] | null> => (
  Wager
    .find({ better_id: userID, ...fields })
    .then((docs) => docs)
    .catch(() => null)
);

const createWagerRequest: RequestHandler = async (req: RequestWithJWT, res) => {
  try {
    const {
      wdl,
      amount,
      data,
      odds,
      move_number,
    } : WagerRequestBody = req.body;

    const better_id = req.user._id;
    const game_id = req.params.id;

    // check game exists and hasn't ended
    const game = await Chess.findById(game_id);
    if (!game) return res.status(404).send({ error: documentNotFoundError });
    if (game.complete) return res.status(400).send({ error: 'Game has already ended' });

    // check user has enough money to place bet
    if (!req.user.account || amount > req.user.account) return res.status(401).json({ error: 'insufficient funds' });

    // fetch live status of the game after bet was placed
    // this makes it harder for betters to exploit any lag in the chess model being updated via the websocket
    await new Promise<void>((resolve, reject) => {
      setTimeout(async () => {
        // TODO: get currentMove from 3rd party API rather than chess model
        const currentMove = game.move_hist.length;
        if (!currentMove) {
          reject(new Error('error getting live update of the game'));
        } else if (move_number !== currentMove + 1) {
          reject(new Error('outdated bet'));
        } else {
          resolve();
        }
      }, 1000); // timeout accounts for any lag in the API used to get live game updates
    });
    const wager = new Wager({
      game_id, better_id, wdl, amount, data, odds, move_number,
    });

    await Users.findByIdAndUpdate(req.user._id, { $inc: { account: -amount } });
    const doc = await wager.save();
    return res.status(200).json(doc.toJSON());
  } catch (error) {
    if (error.message === 'outdated bet') return res.status(401).send({ error: error.message });
    return res.status(500).json({ error: error.message });
  }
};

const getWagerRequest: RequestHandler = async (req: RequestWithJWT, res) => {
  const wager = await getWager(req.params.id);
  if (!wager) { res.status(404).send({ error: documentNotFoundError }); return; }
  if (!wager.better_id.equals(req.user._id)) { res.status(400).send({ error: 'Unauthorized' }); return; }
  res.status(200).send(wager);
};

const getUserWagersRequest: RequestHandler = async (req: RequestWithJWT, res) => {
  const wagers = await getUserWagers(req.user._id, req.query);
  if (!wagers) res.status(500).send({ error: 'An issue occured' });
  else res.status(200).send(wagers);
};

const wagerController = {
  createWagerRequest: requestWithValidation(createWagerRequest),
  getWagerRequest,
  getUserWagersRequest: requestWithValidation(getUserWagersRequest),
};

export default wagerController;
