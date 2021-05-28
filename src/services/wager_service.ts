import { Wager } from 'models';
import {
  CreateQuery, FilterQuery, Query, Types, UpdateQuery,
} from 'mongoose';
import { WagerDoc } from 'types/models';
import chessService from './chess_service';

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
        const currentMove = await chessService.getChessGame(fields.game_id).then((doc) => doc?.move_hist.length);
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

const wagerService = {
  getWager,
  getWagers,
  updateWager,
  updateManyWagers,
  createWager,
};

export default wagerService;
