import { Chess, Wager } from '../models';
import {
  FilterQuery, Types, UpdateQuery,
} from 'mongoose';
import { ChessDoc, CreateChessQuery, GameStatus } from '../types/models/chess';
import { dbErrorHandler, dbNullDocHandler } from './utils';
import { getViewerCount } from '../websockets/chess_websocket';

/**
 * Retreives game from database by ID
 * @param gameId ID of game
 * @returns Promise of game, or null if game not found or error occurs
 */
const getChessGame = async (gameId: string | Types.ObjectId): Promise<ChessDoc> => (
  Chess
    .findById(gameId)
    .then(dbNullDocHandler)
    .catch(dbErrorHandler)
);

/**
 * Retreives games from database that match provided fields
 * @param fields criteria for games to return
 * @returns Promise of games, or null if error occurs
 */
const getManyChessGames = (fields: FilterQuery<ChessDoc>): Promise<ChessDoc[]> => (
  Chess
    .find(fields)
    .limit(1000)
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
    // Get the game first
    const game = await Chess.findById(gameId);
    if (!game) {
      throw new Error('Game not found');
    }

    // Get wager data grouped by move number
    const wagerData = await Wager.aggregate([
      {
        $match: {
          game_id: game._id,
          wdl: false // Only count move-specific wagers, not WDL bets
        }
      },
      {
        $group: {
          _id: '$move_number',
          totalAmount: { $sum: '$amount' }, // Changed from $stake to $amount
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
    ]);

    // Get WDL wager data grouped by outcome
    const wdlWagerData = await Wager.aggregate([
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
    ]);

    // Convert to object format for easier frontend consumption
    const moveWagerData: { [key: string]: { totalAmount: number; betCount: number } } = {};
    wagerData.forEach((item) => {
      moveWagerData[item.moveNumber] = {
        totalAmount: item.totalAmount,
        betCount: item.betCount
      };
    });

    // Convert WDL data to object format with defaults
    const wdlWagerTotals: { [key: string]: { totalAmount: number; betCount: number; averageOdds: number } } = {
      white_win: { totalAmount: 0, betCount: 0, averageOdds: 0 },
      black_win: { totalAmount: 0, betCount: 0, averageOdds: 0 },
      draw: { totalAmount: 0, betCount: 0, averageOdds: 0 }
    };

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

const chessService = {
  getChessGame,
  getManyChessGames,
  updateChessGame,
  createChessGame,
  purgeStaleGames,
  clearGames,
  getGameStats,
};

export default chessService;
