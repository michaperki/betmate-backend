import HttpError from 'helpers/errors';
import { delay } from 'helpers/utils';
import { Wager } from 'models';
import {
  FilterQuery, Query, Types, UpdateQuery,
} from 'mongoose';
import { CreateWagerQuery, PopulatedWagerDoc, WagerDoc } from 'types/models/wager';
import chessService from './chess_service';
import { dbErrorHandler, dbNullDocHandler } from './utils';

/**
 * Retreives wager from database based on ID
 * @param id of wager
 * @returns Promise of wager, or null if not found or error occurs
 */
const getWager = (id: string | Types.ObjectId): Promise<WagerDoc> => (
  Wager
    .findById(id)
    .then(dbNullDocHandler)
    .catch(dbErrorHandler)
);

/**
   * Get wagers from database that match provided fields
   * @param fields criterea for games to return
   * @returns Promise of wager array, or null if error occurs
   */
const getWagers = (fields: FilterQuery<WagerDoc>): Promise<WagerDoc[]> => (
  Wager
    .find(fields)
    .limit(1000)
    .catch(dbErrorHandler)
);

/**
   * Updates wager in database based on provided fields
   * @param id ID of wager to update
   * @param fields to update for wager
   * @returns Promise of updated wager, or null if wager not found or error occurs
   */
const updateWager = (id: string | Types.ObjectId, fields: UpdateQuery<WagerDoc>): Promise<WagerDoc> => (
  Wager
    .findByIdAndUpdate(id, fields, { new: true, runValidators: true })
    .then(dbNullDocHandler)
    .catch(dbErrorHandler)
);

/**
   * Mass updates wagers in database based on provided fields
   * @param conditions criterea for wagers to match.
   * @param fields to update for wager
   * @returns Promise of query result (not the updated wagers), or null if error occurs
   */
const updateManyWagers = (conditions: FilterQuery<WagerDoc>, fields: UpdateQuery<WagerDoc>): Promise<Query<WagerDoc>[]> => (
  Wager
    .updateMany(conditions, fields)
    .catch(dbErrorHandler)
);

/**
 * Create wager in database with provided fields
 * @param fields to create wager
 * @returns Promise of created wager, or null if error occurs
 *
 * Process will wait 1 second to account for input lag. After wait, will check if wager is still valid
 */
const createWager = async (fields: CreateWagerQuery): Promise<WagerDoc> => {
  await delay(1000);
  const game = await chessService.getChessGame(fields.game_id);
  const currentMove = game.move_hist.length;
  const oddsCorrect = Math.abs((1 / (game?.odds[fields.data] ?? 0)) - Number(fields.odds)) < Number.EPSILON; // allows for floating point imprecision

  const wagerValid = (
    fields.move_number === currentMove + 1
    && (!fields.wdl || oddsCorrect)
  );

  if (!wagerValid) throw new HttpError(400, ['Wager not valid']);

  return new Wager(fields).save();
};

const getPopulatedWagers = (fields: FilterQuery<WagerDoc>, populateBy: string): Promise<PopulatedWagerDoc[]> => (
  Wager
    .find(fields)
    .populate(populateBy)
    .catch(dbErrorHandler)
);

const wagerService = {
  getWager,
  getWagers,
  updateWager,
  updateManyWagers,
  createWager,
  getPopulatedWagers,
};

export default wagerService;
