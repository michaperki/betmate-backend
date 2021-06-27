import { Chess } from 'models';
import {
  FilterQuery, Types, UpdateQuery,
} from 'mongoose';
import { PartialWithRequired } from 'types';
import { ChessDoc } from 'types/models/chess';

/**
 * Retreives game from database by ID
 * @param gameId ID of game
 * @returns Promise of game, or null if game not found or error occurs
 */
const getChessGame = (gameId: string | Types.ObjectId): Promise<ChessDoc | null> => (
  Chess
    .findById(gameId)
    .then((doc) => doc)
    .catch(() => null)
);

/**
 * Retreives games from database that match provided fields
 * @param fields criteria for games to return
 * @returns Promise of games, or null if error occurs
 */
const getManyChessGames = (fields: FilterQuery<ChessDoc>): Promise<ChessDoc[] | null> => (
  Chess
    .find(fields)
    .then((result) => result)
    .catch(() => null)
);

/**
 * Updates game in database based on provided fields
 * @param gameId ID of game to update
 * @param fields to update for game
 * @returns Promise of updated game, or null if game not found or error occurs
 */
const updateChessGame = (gameId: string, fields: UpdateQuery<ChessDoc>): Promise<ChessDoc | null> => (
  Chess
    .findByIdAndUpdate(gameId, fields, { new: true, runValidators: true })
    .then((doc) => doc)
    .catch(() => null)
);

/**
 * Create game in database with provided fields
 * @param fields to create game
 * @returns Promise of created game, or null if error occurs
 */
const createChessGame = async (fields: PartialWithRequired<ChessDoc, 'player_white' | 'player_black'>): Promise<ChessDoc | null> => (
  new Chess(fields)
    .save()
    .then((doc) => doc)
    .catch(() => null)
);

/**
 * Deletes all incomplete games in database. Only called on startup of server.
 * @returns Promise of boolean indicating success
 */
const purgeStaleGames = (): Promise<boolean> => Chess.deleteMany({ complete: false }).then((res) => !!res);

const chessService = {
  getChessGame,
  getManyChessGames,
  updateChessGame,
  createChessGame,
  purgeStaleGames,
};

export default chessService;
