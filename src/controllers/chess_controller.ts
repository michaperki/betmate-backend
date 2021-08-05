import { RequestHandler } from 'express';
import { ValidatedRequest } from 'express-joi-validation';

import { chessService } from 'services';
import { GetManyGamesRequest } from 'validation/chess';
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

const chessController = {
  getChessGameRequest,
  getManyChessGamesRequest,
};

export default chessController;
