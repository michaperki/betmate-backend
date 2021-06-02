import { RequestHandler } from 'express';
import { documentNotFoundError } from 'helpers/constants';
import { chessService } from 'services';

/**
 * Get game from request.
 *
 * Uses request param as id
 */
const getChessGameRequest: RequestHandler = (req, res) => {
  chessService.getChessGame(req.params.id)
    .then((result) => (result ? res.status(200).send(result) : res.status(404).json({ errors: [documentNotFoundError] })))
    .catch((error) => res.status(500).json({ errors: [error] }));
};

/**
 * Get many games from request.
 *
 * Uses query as criteria
 *
 * Request must be prefixed with appropriate validation middleware
 * - `chessFilterParams`
 * - `cannotQueryTimestamps`
 * - `validateRequest`
 */
const getManyChessGamesRequest: RequestHandler = async (req, res) => {
  const games = await chessService.getManyChessGames(req.query);
  return games
    ? res.status(200).send(games)
    : res.status(404).json({ errors: [documentNotFoundError] });
};

/**
 * Update game from request.
 *
 * Uses request param as ID and body as update query
 *
 * Request must be prefixed with appropriate validation middleware
 * - `optionalChessFieldsValid`
 * - `validateRequest`
 */
const updateChessGameRequest: RequestHandler = async (req, res) => {
  chessService.updateChessGame(req.params.id, req.body)
    .then((result) => (result ? res.status(200).send(result) : res.status(404).json({ errors: [documentNotFoundError] })))
    .catch((error) => res.status(500).json({ errors: [error] }));
};

/**
 * Create game from request.
 *
 * Uses request body as game fields.
 *
 * Request must be prefixed with appropriate validation middleware
 * - `containsPlayers`
 * - `optionalChessFieldsValid`
 * - `validateRequest`
 */
const createChessGameRequest: RequestHandler = async (req, res) => {
  const chessGame = await chessService.createChessGame(req.body);
  if (!chessGame) { res.status(500).json({ errors: ['Failed to create chess game'] }); return; }
  res.status(200).send(chessGame);
};

const chessController = {
  createChessGameRequest,
  getChessGameRequest,
  getManyChessGamesRequest,
  updateChessGameRequest,
};

export default chessController;
