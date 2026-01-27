/**
 * Development Logger Middleware
 * 
 * This middleware provides improved development-time logging,
 * showing a clear, colorized summary of each request in the console.
 * Only active in development mode.
 */

import { Request, Response, NextFunction } from 'express';
import chalk from 'chalk';
import { enhancedLogger } from '../helpers/logger';

// Skip paths that create too much noise in development
const NOISY_PATHS = [
  '/state',
  '/status',
  '/api/log',
  '/favicon.ico'
];

// Only activate in development mode
const isDevelopment = process.env.NODE_ENV === 'development';

export function devLoggerMiddleware(req: Request, res: Response, next: NextFunction) {
  // Skip in non-development environments
  if (!isDevelopment) {
    return next();
  }
  
  // Skip noisy paths
  if (NOISY_PATHS.some(path => req.path.includes(path))) {
    return next();
  }
  
  // Record start time
  const start = Date.now();
  
  // Log the request
  const method = req.method.toUpperCase();
  const methodColored = method === 'GET' 
    ? chalk.green(method)
    : method === 'POST'
    ? chalk.yellow(method)
    : method === 'PUT'
    ? chalk.blue(method)
    : method === 'DELETE'
    ? chalk.red(method)
    : chalk.gray(method);
  
  const requestLine = `${methodColored} ${chalk.cyan(req.path)}`;
  console.log(`${chalk.gray('→')} ${requestLine}`);
  
  // Capture the response
  const originalSend = res.send;
  res.send = function(body) {
    // Calculate duration
    const duration = Date.now() - start;
    
    // Determine color based on status code
    let statusColor = chalk.green;
    if (res.statusCode >= 500) {
      statusColor = chalk.red;
    } else if (res.statusCode >= 400) {
      statusColor = chalk.yellow;
    } else if (res.statusCode >= 300) {
      statusColor = chalk.cyan;
    }
    
    // Format duration
    let durationColor = chalk.green;
    if (duration > 1000) {
      durationColor = chalk.red;
    } else if (duration > 500) {
      durationColor = chalk.yellow;
    }
    
    // Format response line
    const status = statusColor(`${res.statusCode}`);
    const time = durationColor(`${duration}ms`);
    const responseLine = `${status} ${time}`;
    
    // Log the response
    console.log(`${chalk.gray('←')} ${requestLine} ${responseLine}`);
    
    // Resume original send
    return originalSend.call(this, body);
  };
  
  next();
}

export default devLoggerMiddleware;