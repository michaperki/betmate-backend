import {
  CreateQuery, FilterQuery, Types, UpdateQuery,
} from 'mongoose';
import { RequestHandler } from 'express';
import { documentNotFoundError } from 'helpers/constants';
import { Chess } from 'models';
import { ChessDoc } from 'types/models';

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
const createChessGame = async (fields: CreateQuery<ChessDoc>): Promise<ChessDoc | null> => (
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

/**
 * Get game from request.
 */
const getChessGameRequest: RequestHandler = (req, res) => {
  getChessGame(req.params.id)
    .then((result) => (result ? res.status(200).send(result) : res.status(404).json({ errors: [documentNotFoundError] })))
    .catch((error) => res.status(500).json({ errors: [error] }));
};

/**
 * Get many games from request.
 *
 * Request must be prefixed with appropriate validation middleware
 * - `chessFilterParams`
 * - `cannotQueryTimestamps`
 * - `validateRequest`
 */
const getManyChessGamesRequest: RequestHandler = (req, res) => {
  getManyChessGames(req.query)
    .then((result) => (result ? res.status(200).send(result) : res.status(404).json({ errors: [documentNotFoundError] })))
    .catch((error) => res.status(500).json({ errors: [error] }));
};

/**
 * Update game from request.
 *
 * Request must be prefixed with appropriate validation middleware
 * - `optionalChessFieldsValid`
 * - `validateRequest`
 */
const updateChessGameRequest: RequestHandler = async (req, res) => {
  updateChessGame(req.params.id, req.body)
    .then((result) => (result ? res.status(200).send(result) : res.status(404).json({ errors: [documentNotFoundError] })))
    .catch((error) => res.status(500).json({ errors: [error] }));
};

/**
 * Create game from request.
 *
 * Request must be prefixed with appropriate validation middleware
 * - `containsPlayers`
 * - `optionalChessFieldsValid`
 * - `validateRequest`
 */
const createChessGameRequest: RequestHandler = async (req, res) => {
  const chessGame = await createChessGame(req.body);
  if (!chessGame) { res.status(500).json({ errors: ['Failed to create chess game'] }); return; }
  res.status(200).send(chessGame);
};

const chessController = {
  createChessGame,
  getChessGame,
  updateChessGame,
  purgeStaleGames,
  createChessGameRequest,
  getChessGameRequest,
  getManyChessGamesRequest,
  updateChessGameRequest,
};

export default chessController;
