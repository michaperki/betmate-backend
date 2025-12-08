import { Request, Response, NextFunction } from 'express';
import logger from '../helpers/axiom_logger';

// Extend Request interface to include trace_id
declare global {
  namespace Express {
    interface Request {
      trace_id?: string;
    }
  }
}

/**
 * Extracts context information from the request path
 * Identifies endpoint context like "game:getState" or "wager:create"
 */
const getContextFromPath = (path: string): string => {
  // Clean up the path
  const cleanPath = path.replace(/^\/+|\/+$/g, '');

  if (!cleanPath) return 'root';

  // Split the path
  const parts = cleanPath.split('/');

  // Handle different path patterns
  if (parts.length === 0) return 'root';

  if (parts[0] === 'chess') {
    if (parts.length === 1) return 'chess:list';
    if (parts.length === 2) return 'chess:getGame';
    if (parts[2] === 'state') return 'chess:getState';
    if (parts[2] === 'moves') return 'chess:getMoves';
    return 'chess:other';
  }

  if (parts[0] === 'wager') {
    if (parts.length === 1) return 'wager:list';
    if (parts.length === 2) return 'wager:getWager';
    if (parts[2] === 'place') return 'wager:place';
    return 'wager:other';
  }

  if (parts[0] === 'auth') {
    if (parts[1] === 'signin') return 'auth:signin';
    if (parts[1] === 'signup') return 'auth:signup';
    return 'auth:other';
  }

  if (parts[0] === 'leaderboard') return 'leaderboard:get';

  if (parts[0] === 'analysis') return 'analysis:get';

  // Default to resource:action format
  return `${parts[0]}:${parts[1] || 'default'}`;
};

/**
 * Detect if a request is a polling request based on frequency and pattern
 */
const isPollingRequest = (req: Request): boolean => {
  // Common polling endpoints
  if (req.path.includes('/state') || req.path.includes('/status')) return true;

  // If request has polling=true query param
  if (req.query.polling === 'true') return true;

  // Frontend might add custom headers for polling
  if (req.get('x-polling') === 'true') return true;

  return false;
};

/**
 * Express middleware for logging HTTP requests to Axiom with enhanced context
 */
export const axiomLoggerMiddleware = (req: Request, res: Response, next: NextFunction) => {
  // Generate or use existing trace_id
  req.trace_id = req.get('x-trace-id') || logger.generateTraceId();

  // Add trace_id to response headers for client tracking
  res.set('x-trace-id', req.trace_id);

  // Capture request start time
  const startTime = Date.now();

  // Create a function to log the completed request
  const logRequest = () => {
    // Calculate request duration
    const duration = Date.now() - startTime;

    // Determine context from URL path
    const context = getContextFromPath(req.path);

    // Detect if this is a polling request
    const isPolling = isPollingRequest(req);

    // Extract user ID from authenticated requests
    let userId = null;
    if (req.user) {
      userId = (req.user as any)._id || (req.user as any).id;
    }

    // Extract game ID from path if present
    let gameId = null;
    const gameIdMatch = req.path.match(/\/chess\/([a-f0-9]{24})/i);
    if (gameIdMatch && gameIdMatch[1]) {
      gameId = gameIdMatch[1];
    }

    // Create structured log data
    const logData = {
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      latency_ms: duration,
      ip: req.ip,
      userAgent: req.get('user-agent') || 'unknown',
      query: req.query,
      context,
      isPolling,
      userId,
      gameId,
    };

    // Log based on status code with structured events
    if (res.statusCode >= 500) {
      logger.log({
        level: 'error',
        event: 'request_error',
        trace_id: req.trace_id,
        context: logData
      });
    } else if (res.statusCode >= 400) {
      logger.log({
        level: 'warn',
        event: 'request_client_error',
        trace_id: req.trace_id,
        context: logData
      });
    } else {
      // For successful requests, sample or log only when slow
      const sampleRate = Math.max(0, Math.min(1, parseFloat(process.env.LOG_REQUEST_SAMPLE_RATE || '0.05')));
      const defaultSlow = parseInt(process.env.LOG_SLOW_MS || '1000', 10);
      const pollingSlow = parseInt(process.env.LOG_SLOW_MS_POLLING || '500', 10);
      const slowThreshold = isPolling ? pollingSlow : defaultSlow;

      if (duration > slowThreshold) {
        logger.log({
          level: 'warn',
          event: 'slow_request',
          trace_id: req.trace_id,
          context: { ...logData, slow_threshold_ms: slowThreshold }
        });
      } else if (Math.random() < sampleRate) {
        logger.log({
          level: 'debug',
          event: 'request_sampled',
          trace_id: req.trace_id,
          context: logData
        });
      }
    }

    // Remove listeners to prevent memory leaks
    res.removeListener('finish', logRequest);
    res.removeListener('close', logRequest);
  };

  // Attach listeners for when the response finishes or closes
  res.on('finish', logRequest);
  res.on('close', logRequest);

  // Continue with the request
  next();
};

export default axiomLoggerMiddleware;
