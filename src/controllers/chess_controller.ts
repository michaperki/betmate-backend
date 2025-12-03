import { RequestHandler } from 'express';
import { ValidatedRequest } from 'express-joi-validation';

import { chessService } from '../services';
import { GetManyGamesRequest } from '../validation/chess';
import { handleSuccess, handleFailure } from './utils';
import { logDebug, logError } from '../helpers/dev_logger';

/**
 * Get game from request.
 *
 * Uses request param as id
 *
 * Note: This endpoint may return 304 Not Modified responses when polling.
 * This is normal behavior when no new data is available and helps reduce server load.
 * The frontend should handle these responses appropriately.
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
 * Get game stats including viewer count and move wager data
 */
const getGameStatsRequest: RequestHandler = async (req, res) => {
  try {
    const stats = await chessService.getGameStats(req.params.id);
    logDebug('[STATS DEBUG]', { gameId: req.params.id, stats });
    return handleSuccess(res)(stats);
  } catch (error) {
    logError('[STATS ERROR]', { gameId: req.params.id, error: error.message, stack: error.stack });
    return handleFailure(res)(error);
  }
};

const chessController = {
  getChessGameRequest,
  getManyChessGamesRequest,
  getGameStatsRequest,
};

export default chessController;
