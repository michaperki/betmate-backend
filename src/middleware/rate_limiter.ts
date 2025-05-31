import rateLimit from 'express-rate-limit';
import { RequestHandler } from 'express';
import logger from '../helpers/axiom_logger';

/**
 * Basic rate limiter for general API endpoints
 */
export const apiLimiter: RequestHandler = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  message: { message: 'Too many requests, please try again later.' },
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
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // limit each IP to 10 auth requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many authentication attempts, please try again later.' },
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
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // limit each IP to 5 sensitive operations per hour
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many requests for sensitive operations, please try again later.' },
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