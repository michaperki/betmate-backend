import { RequestHandler } from 'express';
import { ValidatedRequest } from 'express-joi-validation';
import { microserviceService } from '../services';
import { GetMoveAnalysisRequest } from '../validation/analysis';
import { handleSuccess, handleFailure } from './utils';
import logger from '../helpers/axiom_logger';

/**
 * Get move analysis data from request.
 *
 * Uses request query params for FEN and move
 *
 * Request must be prefixed with appropriate validation middleware
 * - `validator.query(GetMoveAnalysisSchema)`
 * - `validateRequest`
 */
const getMoveAnalysisRequest: RequestHandler = (req: ValidatedRequest<GetMoveAnalysisRequest>, res) => {
  const { fen, move } = req.query;

  // Optional debug for troubleshooting
  if (process.env.LOG_ANALYSIS_DEBUG === 'true') {
    logger.log({ level: 'debug', event: 'analysis_move_request', context: { fen, move } });
  }

  // Flag to track if timeout already responded
  let hasResponded = false;

  // Add a timeout to prevent long-hanging requests
  const timeout = setTimeout(() => {
    if (!res.headersSent) {
      hasResponded = true;
      logger.log({ level: 'warn', event: 'analysis_timeout', context: { move, timeout_ms: 5000 } });
      res.status(503).json({ message: 'Engine analysis timed out' });
    }
  }, 5000);

  return microserviceService
    .getMoveAnalysis(fen, move)
    .then(result => {
      clearTimeout(timeout);
      if (process.env.LOG_ANALYSIS_DEBUG === 'true') {
        logger.log({ level: 'debug', event: 'analysis_move_result', context: { move, resultSummary: { score: (result as any)?.score, percentile: (result as any)?.percentile, is_best_move: (result as any)?.is_best_move } } });
      }

      if (!hasResponded && !res.headersSent) {
        return res.status(200).json({
          message: 'SUCCESS',
          data: result
        });
      }
    })
    .catch(error => {
      clearTimeout(timeout);
      logger.log({ level: 'warn', event: 'analysis_move_error', context: { move, error: error.message } });

      // Return a 200 with a specific error message to avoid breaking the frontend
      if (!hasResponded && !res.headersSent) {
        return res.status(200).json({
          message: 'Analysis not available',
          data: null
        });
      }
    });
};

/**
 * Get top moves for a position
 */
const getTopMovesRequest: RequestHandler = (req, res) => {
  const { fen, n = '3' } = req.query;

  if (!fen || typeof fen !== 'string') {
    return res.status(400).json({ message: 'fen parameter is required' });
  }

  // Flag to track if timeout already responded
  let hasResponded = false;

  // Add a timeout to prevent long-hanging requests
  const timeout = setTimeout(() => {
    if (!res.headersSent) {
      hasResponded = true;
      logger.log({ level: 'warn', event: 'top_moves_timeout', context: { timeout_ms: 5000 } });
      res.status(503).json({ message: 'Top moves analysis timed out' });
    }
  }, 5000);

  return microserviceService
    .getTopMoves(fen, parseInt(n as string) || 3)
    .then(result => {
      clearTimeout(timeout);
      if (!hasResponded && !res.headersSent) {
        return res.status(200).json({
          message: 'SUCCESS',
          data: result
        });
      }
    })
    .catch(error => {
      clearTimeout(timeout);
      logger.log({ level: 'warn', event: 'top_moves_error', context: { error: error.message } });
      // Return a 200 with a specific error message to avoid breaking the frontend
      if (!hasResponded && !res.headersSent) {
        return res.status(200).json({
          message: 'Top moves not available',
          data: []
        });
      }
    });
};

const analysisController = {
  getMoveAnalysisRequest,
  getTopMovesRequest,
};

export default analysisController;
