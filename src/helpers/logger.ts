/**
 * Logger integration file to allow for gradual adoption
 * 
 * This file acts as a compatibility layer that maintains the existing API
 * while allowing us to gradually switch to the enhanced logger.
 */

import originalLogger from './axiom_logger';
import enhancedLogger from './enhanced_logger';

// The flag to determine which logger to use
const useEnhancedLogger = process.env.USE_ENHANCED_LOGGER === 'true' 
  || process.env.NODE_ENV === 'development';

// Create a proxy to forward all calls to the appropriate logger
const logger = new Proxy({} as typeof originalLogger, {
  get(target, prop, receiver) {
    if (useEnhancedLogger) {
      return Reflect.get(enhancedLogger, prop, receiver);
    } else {
      return Reflect.get(originalLogger, prop, receiver);
    }
  }
});

export default logger;

// Export enhanced logger for direct use when needed
export { default as enhancedLogger } from './enhanced_logger';
export { default as originalLogger } from './axiom_logger';
export { LoggerConfig, loadLoggerConfig } from './logger_config';