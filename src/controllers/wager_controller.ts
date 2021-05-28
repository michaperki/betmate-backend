/* eslint-disable @typescript-eslint/naming-convention */
import { RequestHandler } from 'express';
import {
  FilterQuery, UpdateQuery, Query, Types, CreateQuery,
} from 'mongoose';
import { documentNotFoundError } from 'helpers/constants';
import { WagerDoc } from 'types/models';
import { Wager } from 'models';
import { RequestWithJWT } from 'types/requests';
import userController from './user_controller';
import chessController from './chess_controller';
// import { requestWithValidation } from 'helpers/validation';

type WagerRequestBody = {
  wdl: boolean,
  amount: number,
  data: string,
  odds: number,
  move_number: number,
};

/**
 * Retreives wager from database based on ID
 * @param id of wager
 * @returns Promise of wager, or null if not found or error occurs
 */
const getWager = (id: string | Types.ObjectId): Promise<WagerDoc | null> => (
  Wager
    .findById(id)
    .then((doc) => doc)
    .catch(() => null)
);

/**
 * Get wagers from database that match provided fields
 * @param fields criterea for games to return
 * @returns Promise of wager array, or null if error occurs
 */
const getWagers = (fields: FilterQuery<WagerDoc>): Promise<WagerDoc[] | null> => (
  Wager
    .find(fields)
    .then((docs) => docs)
    .catch(() => null)
);

/**
 * Updates wager in database based on provided fields
 * @param id ID of wager to update
 * @param fields to update for wager
 * @returns Promise of updated wager, or null if wager not found or error occurs
 */
const updateWager = async (id: string | Types.ObjectId, fields: UpdateQuery<WagerDoc>): Promise<WagerDoc | null> => (
  Wager
    .findByIdAndUpdate(id, fields, { new: true, runValidators: true })
    .then((doc) => doc)
    .catch(() => null)
);

/**
 * Mass updates wagers in database based on provided fields
 * @param conditions criterea for wagers to match.
 * @param fields to update for wager
 * @returns Promise of query result (not the updated wagers), or null if error occurs
 */
const updateManyWagers = (conditions: FilterQuery<WagerDoc>, fields: UpdateQuery<WagerDoc>): Promise<Query<WagerDoc>[] | null> => (
  Wager
    .updateMany(conditions, fields)
    .then((res) => res)
    .catch(() => null)
);

const createWager = async (fields: CreateQuery<WagerDoc>): Promise<WagerDoc | null> => {
  try {
    await new Promise<void>((resolve, reject) => {
      setTimeout(async () => {
        // TODO: get currentMove from 3rd party API rather than chess model
        const currentMove = await chessController.getChessGame(fields.game_id).then((doc) => doc?.move_hist.length);
        if (currentMove === undefined) {
          reject(new Error('Error getting live update of the game'));
        } else if (fields.move_number !== currentMove + 1) {
          reject(new Error('Outdated bet'));
        } else {
          resolve();
        }
      }, 1000); // timeout accounts for any lag in the API used to get live game updates
    });
    return await new Wager(fields).save();
  } catch (error) {
    return null;
  }
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
    const game = await chessController.getChessGame(game_id);
    if (!game) return res.status(404).send({ error: documentNotFoundError });
    if (game.complete) return res.status(400).send({ error: 'Game has already ended' });

    // check user has enough money to place bet
    if (!req.user.account || amount > req.user.account) return res.status(401).json({ error: 'Insufficient funds' });

    // fetch live status of the game after bet was placed
    // this makes it harder for betters to exploit any lag in the chess model being updated via the websocket
    // await new Promise<void>((resolve, reject) => {
    //   setTimeout(async () => {
    //     // TODO: get currentMove from 3rd party API rather than chess model
    //     const currentMove = await chessController.getChessGame(game_id).then((doc) => doc?.move_hist.length);
    //     if (currentMove === undefined) {
    //       reject(new Error('Error getting live update of the game'));
    //     } else if (move_number !== currentMove + 1) {
    //       reject(new Error('Outdated bet'));
    //     } else {
    //       resolve();
    //     }
    //   }, 1000); // timeout accounts for any lag in the API used to get live game updates
    // });
    // const wager = new Wager({
    //   game_id, better_id, wdl, amount, data, odds, move_number,
    // });
    const doc = await createWager({
      game_id,
      better_id,
      wdl,
      amount,
      data,
      odds,
      move_number,
    } as CreateQuery<WagerDoc>);

    await userController.updateUserData(req.user._id, { $inc: { account: -amount } });
    // const doc = await wager.save();
    return res.status(200).json(doc);
  } catch (error) {
    if (error.message === 'Outdated bet') return res.status(401).send({ error: error.message });
    return res.status(500).json({ error: error.message });
  }
};

/**
 * Get wager specified in request
 *
 * ID of requesting user must match `better_id` field of wager
 */
const getWagerRequest: RequestHandler = async (req: RequestWithJWT, res) => {
  const wager = await getWager(req.params.id);
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
  const wagers = await getWagers(fields);
  if (!wagers) res.status(500).send({ error: 'An issue occured' });
  else res.status(200).send(wagers);
};

const wagerController = {
  getWagers,
  updateWager,
  updateManyWagers,
  createWagerRequest,
  getWagerRequest,
  getUserWagersRequest,
};

export default wagerController;
