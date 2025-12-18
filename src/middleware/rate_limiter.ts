import rateLimit from 'express-rate-limit';
import { RequestHandler } from 'express';
import logger from '../helpers/axiom_logger';

// Helper: consider rate limiting enabled only in production unless explicitly turned on
const isRateLimitingEnabled = (): boolean => (
  process.env.NODE_ENV === 'production' || process.env.ENABLE_RATE_LIMITING === 'true'
);

/**
 * Basic rate limiter for general API endpoints
 */
export const apiLimiter: RequestHandler = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  message: { message: 'Too many requests, please try again later.' },
  // Skip entirely when rate limiting is disabled (dev/test)
  skip: () => !isRateLimitingEnabled(),
  handler: (req, res, next, options) => {
    logger.log({
      level: 'warn',
      event: 'rate_limit_exceeded',
      context: {
        ip: req.ip,
        path: req.path,
        method: req.method
      }
    });
    res.status(options.statusCode).send(options.message);
  }
});

/**
 * Stricter rate limiter for authentication endpoints
 */
export const authLimiter: RequestHandler = rateLimit({
  windowMs: Number(process.env.AUTH_RATE_LIMIT_WINDOW_MS || (15 * 60 * 1000)),
  // In dev/test, either skip entirely (via skip) or allow a very high ceiling if enabled for debugging
  max: Number(process.env.AUTH_RATE_LIMIT_MAX || 10),
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many authentication attempts, please try again later.' },
  // Successful auth responses won't count toward the limit (reduces test/dev lockouts)
  skipSuccessfulRequests: true,
  // Skip in dev/test unless explicitly enabled via ENABLE_RATE_LIMITING
  skip: () => (!isRateLimitingEnabled()) || (process.env.DISABLE_AUTH_RATE_LIMIT === 'true'),
  handler: (req, res, next, options) => {
    logger.log({
      level: 'warn',
      event: 'auth_rate_limit_exceeded',
      context: {
        ip: req.ip,
        path: req.path,
        method: req.method
      }
    });
    res.status(options.statusCode).send(options.message);
  }
});

/**
 * Extremely strict limiter for password reset/sensitive operations
 */
export const sensitiveActionLimiter: RequestHandler = rateLimit({
  windowMs: Number(process.env.SENSITIVE_RATE_LIMIT_WINDOW_MS || (60 * 60 * 1000)),
  max: Number(process.env.SENSITIVE_RATE_LIMIT_MAX || 5),
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many requests for sensitive operations, please try again later.' },
  skip: () => !isRateLimitingEnabled(),
  handler: (req, res, next, options) => {
    logger.log({
      level: 'warn',
      event: 'sensitive_rate_limit_exceeded',
      context: {
        ip: req.ip,
        path: req.path,
        method: req.method
      }
    });
    res.status(options.statusCode).send(options.message);
  }
});
