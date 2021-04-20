/* eslint-disable @typescript-eslint/naming-convention */
import { RequestHandler } from 'express';
import { Wager, Chess, Users } from '../models';
import { RequestWithJWT } from '../types/requests';

type WagerRequestBody = {
  wdl: boolean,
  amount: number,
  data: string,
  odds: number,
  move_number: number,
};

const createWager: RequestHandler = async (req: RequestWithJWT, res) => {
  try {
    const {
      wdl,
      amount,
      data,
      odds,
      move_number,
    } : WagerRequestBody = req.body;

    const bettor_id = req.user._id;
    const game_id = req.params.id;

    // check game exists and hasn't ended
    const game = await Chess.find({ _id: game_id, complete: false });
    if (!game) return res.status(404).json({ error: 'game not found or has already ended' });

    // check user has enough money to place bet
    if (!req.user.account || amount > req.user.account) return res.status(401).json({ error: 'insufficient funds' });

    // fetch live status of the game after bet was placed
    // this makes it harder for betters to exploit any lag in the chess model being updated via the websocket
    await new Promise<void>((resolve, reject) => {
      setTimeout(async () => {
        // TODO: get currentMove from 3rd party API rather than chess model
        const currentMove = await Chess.findById(game_id).then((doc) => doc?.toJSON().move_hist.length);
        if (currentMove === null) reject(new Error('error getting live update of the game'));

        if (move_number !== currentMove + 1) {
          reject(new Error('outdated bet'));
        } else {
          resolve();
        }
      }, 3000); // timeout accounts for any lag in the API used to get live game updates
    });
    const wager = new Wager({
      game_id, bettor_id, wdl, amount, data, odds, move_number,
    });

    await Users.findByIdAndUpdate(req.user._id, { $inc: { account: -amount } });
    const doc = await wager.save();
    return res.status(200).json(doc.toJSON());
  } catch (error) {
    if (error.message === 'outdated bet') return res.status(401).send({ error: error.message });
    return res.status(500).json({ error });
  }
};

const wagerController = {
  createWager,
};

export default wagerController;
