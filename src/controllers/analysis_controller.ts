import { RequestHandler } from 'express';
import { ValidatedRequest } from 'express-joi-validation';
import { microserviceService } from '../services';
import { GetMoveAnalysisRequest } from '../validation/analysis';
import { handleSuccess, handleFailure } from './utils';

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
  
  // Flag to track if timeout already responded
  let hasResponded = false;

  // Add a timeout to prevent long-hanging requests
  const timeout = setTimeout(() => {
    if (!res.headersSent) {
      hasResponded = true;
      res.status(503).json({ message: 'Engine analysis timed out' });
    }
  }, 5000);

  return microserviceService
    .getMoveAnalysis(fen, move)
    .then(result => {
      clearTimeout(timeout);
      if (!hasResponded && !res.headersSent) {
        return handleSuccess(res)(result);
      }
    })
    .catch(error => {
      clearTimeout(timeout);
      console.log('Move analysis error:', error.message);
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
      res.status(503).json({ message: 'Top moves analysis timed out' });
    }
  }, 5000);

  return microserviceService
    .getTopMoves(fen, parseInt(n as string) || 3)
    .then(result => {
      clearTimeout(timeout);
      if (!hasResponded && !res.headersSent) {
        return handleSuccess(res)({ message: 'SUCCESS', data: result });
      }
    })
    .catch(error => {
      clearTimeout(timeout);
      console.log('Top moves error:', error.message);
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