import { RequestHandler } from 'express';
import { ValidatedRequest } from 'express-joi-validation';
import { microservice } from 'services';
import { GetMoveAnalysisRequest } from 'validation/analysis';
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
  
  // Add a timeout to prevent long-hanging requests
  const timeout = setTimeout(() => {
    res.status(503).json({ message: 'Engine analysis timed out' });
  }, 5000);

  return microservice
    .getMoveAnalysis(fen, move)
    .then(result => {
      clearTimeout(timeout);
      return handleSuccess(res)(result);
    })
    .catch(error => {
      clearTimeout(timeout);
      console.log('Move analysis error:', error.message);
      // Return a 200 with a specific error message to avoid breaking the frontend
      return res.status(200).json({
        message: 'Analysis not available',
        data: null
      });
    });
};

const analysisController = {
  getMoveAnalysisRequest,
};

export default analysisController;