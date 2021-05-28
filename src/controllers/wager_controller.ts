/* eslint-disable @typescript-eslint/naming-convention */
import { RequestHandler } from 'express';
import { documentNotFoundError } from 'helpers/constants';
import { RequestWithJWT } from 'types/requests';
import { chessService, userService, wagerService } from 'services';

type WagerRequestBody = {
  wdl: boolean,
  amount: number,
  data: string,
  odds: number,
  move_number: number,
};

/**
 * Create wager from request
 *
 * Request must be prefixed with appropriate validation middleware
 * - `createWagerFieldsValid`
 * - `validateRequest`
 *
 * Creating a wager can fail for the following reasons
 * - Game specified not found
 * - Game specified already finished
 * - User does not have enough money in account to create wager
 * - After accounting for input lag (1 second), game state has changed
 */
const createWagerRequest: RequestHandler = async (req: RequestWithJWT, res) => {
  const { amount } : WagerRequestBody = req.body;

  const better_id = req.user._id;
  const game_id = req.params.id;

  // check game exists and hasn't ended
  const game = await chessService.getChessGame(game_id);
  if (!game) return res.status(404).send({ error: documentNotFoundError });
  if (game.complete) return res.status(400).send({ error: 'Game has already ended' });

  // check user has enough money to place bet
  if (!req.user.account || amount > req.user.account) return res.status(401).json({ error: 'Insufficient funds' });

  const doc = await wagerService.createWager({ game_id, better_id, ...req.body });

  if (doc) {
    await userService.updateUserData(req.user._id, { $inc: { account: -amount } });
    return res.status(200).json(doc);
  }
  return res.status(401).send({ error: 'Outdated bet' });
};

/**
 * Get wager specified in request
 *
 * ID of requesting user must match `better_id` field of wager
 */
const getWagerRequest: RequestHandler = async (req: RequestWithJWT, res) => {
  const wager = await wagerService.getWager(req.params.id);
  if (!wager) return res.status(404).send({ error: documentNotFoundError });
  if (!wager.better_id.equals(req.user._id)) return res.status(400).send({ error: 'Unauthorized' });
  return res.status(200).send(wager);
};

/**
 * Get all wagers of requesting user
 *
 * Request must be prefixed with appropriate validation middleware
 * - `wagerFilterParams`
 * - `cannotQueryTimestamps`
 * - `validateRequest`
 */
const getUserWagersRequest: RequestHandler = async (req: RequestWithJWT, res) => {
  const fields = { better_id: req.user._id, ...req.query };
  const wagers = await wagerService.getWagers(fields);
  if (!wagers) res.status(500).send({ error: 'An issue occured' });
  else res.status(200).send(wagers);
};

const wagerController = {
  createWagerRequest,
  getWagerRequest,
  getUserWagersRequest,
};

export default wagerController;
