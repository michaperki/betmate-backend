/* eslint-disable @typescript-eslint/naming-convention */
import { RequestHandler } from 'express';

import { RequestWithJWT, ValidatedRequestWithJWT } from 'types/requests';
import { chessService, userService, wagerService } from 'services';
import { CreateWagerRequest, GetWagersRequest } from 'validation/wager';
import { handleFailure, handleSuccess } from './utils';

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
 * - `requireAuth`
 * - `validator.body(CreateWagerSchema)`
 * - `validateRequest`
 *
 * Creating a wager can fail for the following reasons
 * - Game specified not found
 * - Game specified already finished
 * - User does not have enough money in account to create wager
 * - After accounting for input lag (1 second), game state has changed
 */
const createWagerRequest: RequestHandler = async (req: ValidatedRequestWithJWT<CreateWagerRequest>, res) => {
  try {
    const { amount } : WagerRequestBody = req.body;

    const better_id = req.user._id;
    const game_id = req.params.id;

    // check game exists and hasn't ended
    const game = await chessService.getChessGame(game_id);
    if (game.complete) return res.status(400).send({ error: 'Game has already ended' });

    // check user has enough money to place bet
    if (!req.user.account || amount > req.user.account) return res.status(401).json({ error: 'Insufficient funds' });

    const doc = await wagerService.createWager({ game_id, better_id, ...req.body });

    await userService.updateUserData(req.user._id, { $inc: { account: -amount } });
    return res.status(200).json(doc);
  } catch (error) {
    return handleFailure(res)(error);
  }
};

/**
 * Get wager specified in request
 *
 * ID of requesting user must match `better_id` field of wager
 *
 * Request must be prefixed with appropriate validation middleware
 * - `requireAuth`
 */
const getWagerRequest: RequestHandler = async (req: RequestWithJWT, res) => {
  try {
    const wager = await wagerService.getWager(req.params.id);
    if (!wager.better_id.equals(req.user._id)) return res.status(400).send({ error: 'Unauthorized' });
    return res.status(200).send(wager);
  } catch (error) {
    return handleFailure(res)(error);
  }
};

/**
 * Get all wagers of requesting user
 *
 * Request must be prefixed with appropriate validation middleware
 * - `requireAuth`
 * - `validator.query(GetWagersSchema)`
 * - `validateRequest`
 */
const getUserWagersRequest: RequestHandler = (req: ValidatedRequestWithJWT<GetWagersRequest>, res) => (
  wagerService
    .getWagers({ better_id: req.user._id, ...req.query })
    .then(handleSuccess(res))
    .catch(handleFailure(res))
);

const wagerController = {
  createWagerRequest,
  getWagerRequest,
  getUserWagersRequest,
};

export default wagerController;
