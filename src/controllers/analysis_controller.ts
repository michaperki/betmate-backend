import { RequestHandler } from 'express';
import { ValidatedRequest } from 'express-joi-validation';
import { microserviceService } from '../services';
import { GetMoveAnalysisRequest, BatchMoveAnalysisRequest } from '../validation/analysis';
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

/**
 * Batch move analysis for a list of SAN moves in one request
 * Body: { fen: string, moves: string[] }
 */
const getBatchMoveAnalysisRequest: RequestHandler = async (req: ValidatedRequest<BatchMoveAnalysisRequest>, res) => {
  const { fen, moves } = req.body;
  try {
    const canonical = (s: string) => String(s || '').replace(/[+#]$/g, '');
    const uniq = Array.from(new Set((moves || []).map(canonical))).filter(Boolean).slice(0, 16);
    if (!fen || !uniq.length) return res.status(400).json({ message: 'Invalid request' });

    // First, fetch top moves to satisfy any requested moves already covered
    const top = await microserviceService.getTopMoves(fen, Math.max(12, uniq.length));
    const topMap = new Map<string, any>();
    for (const item of top || []) {
      if (!item || typeof item !== 'object') continue;
      const key = canonical(String((item as any).move || ''));
      if (key) topMap.set(key, item);
    }

    // For missing moves, fall back to individual analysis
    const missing = uniq.filter((m) => !topMap.has(m));
    const promises = missing.map((m) => microserviceService.getMoveAnalysis(fen, m).then((r) => ({ key: m, val: r })).catch(() => ({ key: m, val: null })));
    const results = await Promise.all(promises);

    const resultMap = new Map<string, any>();
    // Seed with topMap entries
    for (const [k, v] of topMap.entries()) resultMap.set(k, v);
    // Fill missing from individual calls
    for (const r of results) {
      if (r && r.key && r.val) resultMap.set(r.key, r.val);
    }

    // Build response in input order
    const out = uniq.map((m) => {
      const v = resultMap.get(m);
      if (!v) {
        return { move: m, score: 0, percentile: 40, is_best_move: false };
      }
      // Normalize shape
      const mv = String((v as any).move || m);
      const score = Number((v as any).score || 0);
      const percentile = Number((v as any).percentile ?? 0);
      const is_best_move = Boolean((v as any).is_best_move);
      return { move: mv, score, percentile, is_best_move };
    });

    return res.status(200).json({ message: 'SUCCESS', data: out });
  } catch (error: any) {
    logger.log({ level: 'error', event: 'batch_move_analysis_error', context: { error: error?.message } });
    return res.status(200).json({ message: 'Batch analysis not available', data: [] });
  }
};

const analysisController = {
  getMoveAnalysisRequest,
  getTopMovesRequest,
  getBatchMoveAnalysisRequest,
};

export default analysisController;
