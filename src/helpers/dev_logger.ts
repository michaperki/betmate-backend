import type { LogLevel } from './axiom_logger';

const levelOrder: LogLevel[] = ['debug', 'info', 'warn', 'error'];
const envLevel = (process.env.LOG_LEVEL || (process.env.NODE_ENV === 'development' ? 'info' : 'warn')).toLowerCase();
const normalizedLevel = (levelOrder.includes(envLevel as LogLevel) ? envLevel : 'info') as LogLevel;

const shouldLog = (level: LogLevel): boolean => {
  return levelOrder.indexOf(level) >= levelOrder.indexOf(normalizedLevel);
};

const log = (level: LogLevel, ...args: unknown[]): void => {
  if (!shouldLog(level)) {
    return;
  }
  const consoleFn = (console as any)[level] || console.log;
  consoleFn(...args);
};

export const logDebug = (...args: unknown[]): void => log('debug', ...args);
export const logInfo = (...args: unknown[]): void => log('info', ...args);
export const logWarn = (...args: unknown[]): void => log('warn', ...args);
export const logError = (...args: unknown[]): void => log('error', ...args);

export default {
  logDebug,
  logInfo,
  logWarn,
  logError,
};
