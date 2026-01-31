import HttpError from '../helpers/errors';
import { delay } from '../helpers/utils';
import { Wager } from '../models';
import {
  FilterQuery, Query, Types, UpdateQuery,
} from 'mongoose';
import { CreateWagerQuery, PopulatedWagerDoc, WagerDoc } from '../types/models/wager';
import chessService from './chess_service';
import logger from '../helpers/logger';
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
   * Get wagers from database that match provided fields with optimized querying
   * @param fields criteria for wagers to return
   * @param projection Optional fields to include/exclude
   * @param sort Optional sorting criteria
   * @param limit Optional limit on number of returned documents
   * @returns Promise of wager array, or null if error occurs
   */
const getWagers = (
  fields: FilterQuery<WagerDoc>,
  projection?: Record<string, number>,
  sort: Record<string, number> = { created_at: -1 },
  limit: number = 100
): Promise<WagerDoc[]> => (
  Wager
    .find(fields, projection)
    .sort(sort)
    .limit(limit)
    // .cache(60) // Cache temporarily disabled
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
const updateManyWagers = (conditions: FilterQuery<WagerDoc>, fields: UpdateQuery<WagerDoc>) => (
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
  // Handle special fields for bot wagers
  const isBot = fields.is_bot === true;
  const skipGameCheck = isBot && fields.skip_game_check === true;

  // Extract standard fields for the wager, removing any special flags
  const { skip_game_check, ...wagerFields } = fields as any;

  // For bot wagers, ensure the odds field is valid
  if (isBot) {
    // Use a reasonable default for bot wagers if missing or invalid
    wagerFields.odds = wagerFields.odds >= 1 ? wagerFields.odds : 1;
  }

  // For bot wagers with skip check, bypass all validation
  if (skipGameCheck) {
    return new Wager(wagerFields).save();
  }

  await delay(1000);

  try {
    const game = await chessService.getChessGame(fields.game_id);
    const currentMove = game.move_hist.length;

    // Use variable tolerance for floating point comparisons
    // More lenient for draw bets which have small probabilities and higher volatility
    let ODDS_TOLERANCE = 0.05; // Default 5% relative tolerance

    // For draw bets, use a much more lenient tolerance due to timing/sync issues
    if (fields.wdl && fields.data === 'draw') {
      ODDS_TOLERANCE = 0.50; // 50% tolerance for draw bets
    }

    // Check if the odds from the game are valid (not undefined or zero)
    let gameOdds: number | undefined;

    // Handle WDL wagers properly with direct property access
    if (fields.wdl) {
      if (fields.data === 'white_win') {
        gameOdds = game?.odds.white_win;
      } else if (fields.data === 'black_win') {
        gameOdds = game?.odds.black_win;
      } else if (fields.data === 'draw') {
        gameOdds = game?.odds.draw;
      }
    } else {
      // For non-WDL (move) wagers, use bracket notation
      gameOdds = game?.odds[fields.data];
    }

    const calculatedOdds = gameOdds && gameOdds > 0 ? 1 / gameOdds : 0;

    // Use relative difference for validation (especially important for small probabilities like draws)
    const relativeDiff = calculatedOdds > 0 ? Math.abs(calculatedOdds - Number(fields.odds)) / calculatedOdds : 1;
    const oddsCorrect = relativeDiff < ODDS_TOLERANCE;

    // Logging to debug draw bet issues
    if (process.env.LOG_GAME_EVENTS === 'true') {
      logger.log({ level: 'debug', event: 'wager_validate_debug', context: { data: fields.data, gameOdds, calculatedOdds, sent: fields.odds, relativeDiff: Number(relativeDiff.toFixed(4)), tolerancePct: ODDS_TOLERANCE * 100 } });
    }

    // Special handling for extremely small draw odds
    let specialDrawCase = false;
    if (fields.wdl && fields.data === 'draw' && gameOdds && gameOdds < 0.02) {
      specialDrawCase = true;
      if (process.env.LOG_GAME_EVENTS === 'true') {
        logger.log({ level: 'debug', event: 'wager_special_draw', context: { gameOdds } });
      }
    }

    // Different validation rules for move-specific wagers vs. game outcome (WDL) wagers
    let wagerValid = fields.wdl
      ? (oddsCorrect || specialDrawCase)
      : (fields.move_number === currentMove + 1);

    // Allow Real-mode WDL wagers priced server-side with margin and clamps
    if (fields.wdl && (fields as any).mode === 'real') {
      wagerValid = true;
    }

    // Always accept Arcade (K-Bits) wagers regardless of odds/move checks
    if ((fields as any).mode === 'arcade') {
      wagerValid = true;
    }

    // Additional logging to debug validation
    if (process.env.LOG_GAME_EVENTS === 'true') {
      logger.log({ level: 'debug', event: 'wager_validation', context: { type: fields.wdl ? 'WDL' : 'move', data: fields.data, valid: wagerValid, move_check: fields.move_number === currentMove + 1, odds_check: oddsCorrect } });
    }

    if (!wagerValid) throw new HttpError(400, ['Wager not valid']);
  } catch (error) {
    if (!isBot) {
      throw error; // Re-throw for non-bot wagers
    }
    // For bot wagers, proceed anyway - but quietly
  }

  return new Wager(wagerFields).save();
};

/**
 * Get populated wagers with optimized querying
 * @param fields criteria for wagers to return
 * @param populateBy fields to populate
 * @param sort Optional sorting criteria
 * @param limit Optional limit on number of returned documents
 * @returns Promise of populated wager array
 */
const getPopulatedWagers = (
  fields: FilterQuery<WagerDoc>,
  populateBy: string,
  sort: Record<string, number> = { created_at: -1 },
  limit: number = 100
) => (
  Wager
    .find(fields)
    .sort(sort)
    .limit(limit)
    .populate(populateBy)
    .lean() // Use lean() to convert to plain JavaScript objects - significantly improves performance
    // .cache(60) // Cache temporarily disabled
    .then((docs: any[]) => docs as unknown as PopulatedWagerDoc[])
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
