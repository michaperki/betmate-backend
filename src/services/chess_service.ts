import { Chess, Wager } from '../models';
import {
  FilterQuery, Types, UpdateQuery,
} from 'mongoose';
import { ChessDoc, CreateChessQuery, GameStatus } from '../types/models/chess';
import { dbErrorHandler, dbNullDocHandler } from './utils';
import { getViewerCount } from '../websockets/chess_websocket';

/**
 * Retreives game from database by ID with optional projection
 * @param gameId ID of game
 * @param projection Optional fields to include/exclude
 * @returns Promise of game, or null if game not found or error occurs
 */
const getChessGame = async (
  gameId: string | Types.ObjectId,
  projection?: Record<string, number>
): Promise<ChessDoc> => (
  Chess
    .findById(gameId, projection)
    .then(dbNullDocHandler)
    .catch(dbErrorHandler)
);

/**
 * Retreives games from database that match provided fields
 * @param fields criteria for games to return
 * @param projection Optional fields to include/exclude
 * @param sort Optional sorting criteria
 * @param limit Optional limit on number of returned documents
 * @returns Promise of games, or null if error occurs
 */
const getManyChessGames = (
  fields: FilterQuery<ChessDoc>,
  projection?: Record<string, number>,
  sort: Record<string, number> = { created_at: -1 },
  limit: number = 100
): Promise<ChessDoc[]> => (
  Chess
    .find(fields, projection)
    .sort(sort)
    .limit(limit)
    // .cache(300) // Cache temporarily disabled
    .catch(dbErrorHandler)
);

/**
 * Updates game in database based on provided fields
 * @param gameId ID of game to update
 * @param fields to update for game
 * @returns Promise of updated game, or null if game not found or error occurs
 */
const updateChessGame = (gameId: string, fields: UpdateQuery<ChessDoc>): Promise<ChessDoc> => (
  Chess
    .findByIdAndUpdate(gameId, fields, { new: true, runValidators: true })
    .then(dbNullDocHandler)
    .catch(dbErrorHandler)
);

/**
 * Create game in database with provided fields
 * @param fields to create game
 * @returns Promise of created game, or null if error occurs
 */
const createChessGame = async (fields: CreateChessQuery): Promise<ChessDoc> => (
  new Chess(fields)
    .save()
    .catch(dbErrorHandler)
);

/**
 * Deletes all incomplete games in database. Only called on startup of server.
 * @returns Promise of boolean indicating success
 */
const purgeStaleGames = async (): Promise<boolean> => {
  const deleteOne = await Chess.deleteMany({ complete: false }).then((res) => !!res);
  const deleteTwo = await Chess.deleteMany({ game_status: { $in: [GameStatus.IN_PROGRESS, GameStatus.NOT_STARTED] } }).then((res) => !!res);
  return deleteOne && deleteTwo;
};

const clearGames = async (): Promise<boolean> => {
  try {
    const now = new Date();
    const lastMonth = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    await Chess.deleteMany({ created_at: { $lte: lastMonth } });
    return true;
  } catch (error) {
    return false;
  }
};

/**
 * Get game statistics including viewer count and move wager data
 * @param gameId ID of game
 * @returns Promise of game stats object
 */
const getGameStats = async (gameId: string | Types.ObjectId) => {
  try {
    // Get only the necessary fields from the game
    const game = await Chess.findById(gameId, {
      _id: 1,
      move_hist: 1,
      game_status: 1
    }); // Cache temporarily disabled

    if (!game) {
      throw new Error('Game not found');
    }

    // Run both aggregations in parallel for better performance
    const [wagerData, wdlWagerData] = await Promise.all([
      // Get wager data grouped by move number with optimized pipeline
      Wager.aggregate([
        {
          $match: {
            game_id: game._id,
            wdl: false // Only count move-specific wagers, not WDL bets
          }
        },
        {
          $group: {
            _id: '$move_number',
            totalAmount: { $sum: '$amount' },
            betCount: { $sum: 1 }
          }
        },
        {
          $project: {
            moveNumber: '$_id',
            totalAmount: 1,
            betCount: 1,
            _id: 0
          }
        }
      ]).allowDiskUse(true), // Allow disk use for large aggregations, cache temporarily disabled

      // Get WDL wager data grouped by outcome with optimized pipeline
      Wager.aggregate([
        {
          $match: {
            game_id: game._id,
            wdl: true // Only count WDL bets
          }
        },
        {
          $group: {
            _id: '$data',
            totalAmount: { $sum: '$amount' },
            betCount: { $sum: 1 },
            averageOdds: { $avg: '$odds' }
          }
        },
        {
          $project: {
            outcome: '$_id',
            totalAmount: 1,
            betCount: 1,
            averageOdds: 1,
            _id: 0
          }
        }
      ]).allowDiskUse(true) // Allow disk use for large aggregations, cache temporarily disabled
    ]);

    // Use map instead of forEach for better performance when building objects
    // Convert to object format for easier frontend consumption
    const moveWagerData = wagerData.reduce((acc, item) => {
      acc[item.moveNumber] = {
        totalAmount: item.totalAmount,
        betCount: item.betCount
      };
      return acc;
    }, {} as { [key: string]: { totalAmount: number; betCount: number } });

    // Convert WDL data to object format with defaults
    const wdlWagerTotals: { [key: string]: { totalAmount: number; betCount: number; averageOdds: number } } = {
      white_win: { totalAmount: 0, betCount: 0, averageOdds: 0 },
      black_win: { totalAmount: 0, betCount: 0, averageOdds: 0 },
      draw: { totalAmount: 0, betCount: 0, averageOdds: 0 }
    };

    // Use map for better performance
    wdlWagerData.forEach((item) => {
      wdlWagerTotals[item.outcome] = {
        totalAmount: item.totalAmount,
        betCount: item.betCount,
        averageOdds: item.averageOdds
      };
    });

    // Get real viewer count from websocket tracking
    const viewerCount = getViewerCount(game._id.toString());

    return {
      gameId: game._id.toString(),
      viewerCount,
      moveWagerData,
      wdlWagerTotals,
      currentMoveNumber: game.move_hist?.length || 0,
      gameStatus: game.game_status
    };
  } catch (error) {
    return dbErrorHandler(error);
  }
};

/**
 * Get the most recent active games
 * @param start Starting index for pagination
 * @param limit Maximum number of games to return
 * @returns Promise of active games, sorted by most recent first
 */
const getActiveGames = async (start: number = 0, limit: number = 10): Promise<ChessDoc[]> => {
  return Chess.find({
    game_status: { $in: [GameStatus.NOT_STARTED, GameStatus.IN_PROGRESS] },
    complete: { $ne: true }
  })
  .sort({ created_at: -1 })
  .skip(start)
  .limit(limit)
  .catch(dbErrorHandler);
};

const chessService = {
  getChessGame,
  getManyChessGames,
  updateChessGame,
  createChessGame,
  purgeStaleGames,
  clearGames,
  getGameStats,
  getActiveGames,
};

export default chessService;
