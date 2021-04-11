/* eslint-disable @typescript-eslint/naming-convention */
import { RequestHandler } from 'express';
import { WagerMove, WagerWDL } from 'types/models';
import { Wager, Chess, Users } from '../models';
import { GameStatus } from '../helpers/constants';
import { RequestWithJWT } from '../types/requests';

const createWager: RequestHandler = async (req: RequestWithJWT, res) => {
  try {
    const {
      wdl,
      amount,
      data,
    } : {
      game_id: string,
      wdl: boolean,
      amount: number,
      data: WagerWDL | WagerMove,
    } = req.body;

    const bettor_id = req.user._id;
    const game_id = req.params.id;

    // check game exists
    const game = await Chess.findById(game_id);
    if (!game) return res.status(404).json({ error: 'game not found' });

    // check if game has started for wdl bets
    const gameJSON = game.toJSON();
    if (wdl && gameJSON.game_status !== GameStatus.NOT_STARTED) {
      return res.status(401).json({ error: 'game has already started' });
    }

    // check user has enough money to place bet
    if (!req.user.account || amount > req.user.account) return res.status(401).json({ error: 'insufficient funds' });

    // TODO: get odds from ML model
    const odds = -110;

    const wager = new Wager({
      game_id, bettor_id, wdl, amount, data, odds,
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
