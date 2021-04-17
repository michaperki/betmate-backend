/* eslint-disable @typescript-eslint/naming-convention */
import { RequestHandler } from 'express';
import { WagerMove, WagerWDL } from 'types/models';
import { Wager, Chess, Users } from '../models';
import { RequestWithJWT } from '../types/requests';

type WagerRequestBody = {
  wdl: boolean,
  amount: number,
  data: WagerWDL | WagerMove,
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

    const wager = new Wager({
      game_id, bettor_id, wdl, amount, data, odds, move_number,
    });

    await Users.findByIdAndUpdate(req.user._id, { $inc: { account: -amount } });
    const doc = await wager.save();
    return res.status(200).json(doc.toJSON());
  } catch (error) {
    return res.status(500).json({ error });
  }
};

const wagerController = {
  createWager,
};

export default wagerController;
