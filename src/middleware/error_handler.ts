import { Request, Response, NextFunction } from 'express';
import logger from '../helpers/logger';

/**
 * Extracts context information from the request path - same as in axiom_logger_middleware
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
 * Global error handler middleware that logs errors to Axiom
 * This should be added after all routes and other middleware
 */
export const errorHandler = (err: Error, req: Request, res: Response, next: NextFunction) => {
  // Extract stack trace but don't send it to the client
  const stackTrace = err.stack || '';

  // Determine context from URL path
  const context = getContextFromPath(req.path);

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

  // Log the error with detailed context
  logger.error('Unhandled server error', {
    error: err.message,
    stack: stackTrace,
    method: req.method,
    path: req.path,
    ip: req.ip,
    userAgent: req.get('user-agent') || 'unknown',
    query: req.query,
    body: req.body,

    // Enhanced context
    context,
    userId,
    gameId
  });

  // Send a generic error response to the client
  res.status(500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong',
  });
};

export default errorHandler;
