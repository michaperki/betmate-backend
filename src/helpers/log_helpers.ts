import logger from './logger';

export interface LogContext {
  context: string;
  userId?: string;
  gameId?: string;
  isPolling?: boolean;
  duration?: number;
  [key: string]: any;
}

/**
 * Helper function to log game-related events with consistent context
 */
export const logGameEvent = (
  level: 'info' | 'warn' | 'error' | 'debug',
  message: string,
  gameId: string,
  userId?: string,
  additionalContext?: Record<string, any>
) => {
  const context: LogContext = {
    context: 'game:event',
    gameId,
    userId,
    ...additionalContext
  };
  
  return logger[level](message, context);
};

/**
 * Helper function to log wager-related events with consistent context
 */
export const logWagerEvent = (
  level: 'info' | 'warn' | 'error' | 'debug',
  message: string,
  wagerId: string,
  userId?: string,
  gameId?: string,
  additionalContext?: Record<string, any>
) => {
  const context: LogContext = {
    context: 'wager:event',
    wagerId,
    userId,
    gameId,
    ...additionalContext
  };
  
  return logger[level](message, context);
};

/**
 * Helper function to log user-related events with consistent context
 */
export const logUserEvent = (
  level: 'info' | 'warn' | 'error' | 'debug',
  message: string,
  userId: string,
  additionalContext?: Record<string, any>
) => {
  const context: LogContext = {
    context: 'user:event',
    userId,
    ...additionalContext
  };
  
  return logger[level](message, context);
};

/**
 * Helper function to log performance-related events with consistent context
 */
export const logPerformance = (
  message: string,
  context: string,
  duration: number,
  additionalContext?: Record<string, any>
) => {
  const logContext: LogContext = {
    context,
    duration,
    ...additionalContext
  };
  
  return logger.info(message, logContext);
};

export default {
  logGameEvent,
  logWagerEvent,
  logUserEvent,
  logPerformance
};
