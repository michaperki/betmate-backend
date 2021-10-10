import { Chess } from 'models';
import {
  FilterQuery, Types, UpdateQuery,
} from 'mongoose';
import { ChessDoc, CreateChessQuery, GameStatus } from 'types/models/chess';
import { dbErrorHandler, dbNullDocHandler } from './utils';

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

const chessService = {
  getChessGame,
  getManyChessGames,
  updateChessGame,
  createChessGame,
  purgeStaleGames,
  clearGames,
};

export default chessService;
