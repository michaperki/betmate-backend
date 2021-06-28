import { RequestHandler } from 'express';
import { ValidatedRequest } from 'express-joi-validation';

import { chessService } from 'services';
import { CreateGameRequest, GetManyGamesRequest, UpdateGameRequest } from 'validation/chess';
import { handleSuccess, handleFailure } from './utils';

/**
 * Get game from request.
 *
 * Uses request param as id
 */
const getChessGameRequest: RequestHandler = (req, res) => (
  chessService
    .getChessGame(req.params.id)
    .then(handleSuccess(res))
    .catch(handleFailure(res))
);

/**
 * Get many games from request.
 *
 * Uses query as criteria
 *
 * Request must be prefixed with appropriate validation middleware
 * - `validator.query(GetManyGamesSchema)`
 * - `validateRequest`
 */
const getManyChessGamesRequest: RequestHandler = (req: ValidatedRequest<GetManyGamesRequest>, res) => (
  chessService
    .getManyChessGames(req.query)
    .then(handleSuccess(res))
    .catch(handleFailure(res))
);

/**
 * Update game from request.
 *
 * Uses request param as ID and body as update query
 *
 * Request must be prefixed with appropriate validation middleware
 * - `validator.body(UpdateGameSchema)`
 * - `validateRequest`
 */
const updateChessGameRequest: RequestHandler = (req: ValidatedRequest<UpdateGameRequest>, res) => (
  chessService
    .updateChessGame(req.params.id, req.body)
    .then(handleSuccess(res))
    .catch(handleFailure(res))
);

/**
 * Create game from request.
 *
 * Uses request body as game fields.
 *
 * Request must be prefixed with appropriate validation middleware
 * - `validator.body(CreateGameSchema)`
 * - `validateRequest`
 */
const createChessGameRequest: RequestHandler = (req: ValidatedRequest<CreateGameRequest>, res) => (
  chessService
    .createChessGame(req.body)
    .then(handleSuccess(res))
    .catch(handleFailure(res))
);
const chessController = {
  createChessGameRequest,
  getChessGameRequest,
  getManyChessGamesRequest,
  updateChessGameRequest,
};

export default chessController;
