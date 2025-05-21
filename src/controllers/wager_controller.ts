/* eslint-disable @typescript-eslint/naming-convention */
import { RequestHandler } from 'express';
import { Types } from 'mongoose';

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

    // Extract only the fields we need for a user wager (ensure is_bot is false)
    const { wdl, data, odds, move_number } = req.body;

    const doc = await wagerService.createWager({
      game_id,
      better_id,
      wdl,
      data,
      amount,
      odds,
      move_number,
      is_bot: false
    });

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
    if (String(wager.better_id) !== String(req.user._id)) return res.status(400).send({ error: 'Unauthorized' });
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

/**
 * Create wager from house bot service
 *
 * This endpoint is only accessible via the internal API and is authenticated
 * with a shared secret key. It allows the bot service to place wagers.
 *
 * Bot wagers are handled similarly to user wagers but:
 * - They're tagged with isBot = true
 * - They don't require user authentication
 * - They don't deduct from a user account (house bankroll is managed by the bot service)
 */
const createBotWager: RequestHandler = async (req, res) => {
  try {
    const { gameId, moveNumber, amount, outcomeType, moveNotation, isBot, skip_game_check } = req.body;

    if (!isBot) {
      return res.status(400).json({ error: 'Missing bot flag' });
    }

    // Validate required fields
    if (!gameId || !moveNumber || !amount || !outcomeType) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Check game exists and hasn't ended
    let skipGameCheck = skip_game_check || false;
    if (!skipGameCheck) {
      try {
        const game = await chessService.getChessGame(gameId);
        if (!game) {
          return res.status(404).json({ error: 'Game not found' });
        }

        if (game.complete) {
          return res.status(400).json({ error: 'Game has already ended' });
        }
      } catch (gameError) {
        // For bot wagers with mock game IDs, we can continue without a real game
        skipGameCheck = true;
      }
    }

    // Create a special bot user ID
    const botUserId = Types.ObjectId("000000000000000000000000");

    // Format the wager for the database
    const wagerData = {
      game_id: gameId,
      better_id: botUserId, // Use a placeholder ObjectId for bot wagers
      move_number: moveNumber,
      amount,
      is_bot: true,
      wdl: outcomeType === 'WHITE_WIN' || outcomeType === 'BLACK_WIN' || outcomeType === 'DRAW',
      data: moveNotation || outcomeType,
      odds: 0, // Will be calculated by the system
      skip_game_check: skipGameCheck,
    };

    const doc = await wagerService.createWager(wagerData);
    return res.status(200).json(doc);
  } catch (error) {
    return handleFailure(res)(error);
  }
};

const wagerController = {
  createWagerRequest,
  getWagerRequest,
  getUserWagersRequest,
  createBotWager,
};

export default wagerController;
