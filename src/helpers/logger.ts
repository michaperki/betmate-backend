/**
 * Logger integration file to allow for gradual adoption
 * 
 * This file acts as a compatibility layer that maintains the existing API
 * while allowing us to gradually switch to the enhanced logger.
 */

import originalLogger from './axiom_logger';
import enhancedLogger from './enhanced_logger';

// Select a single logger instance at module init to avoid duplicate initialization
const useEnhancedLogger = process.env.USE_ENHANCED_LOGGER === 'true'
  || process.env.NODE_ENV === 'development';

const logger = useEnhancedLogger ? enhancedLogger : originalLogger;

export default logger;

// Export enhanced logger for direct use when needed
export { default as enhancedLogger } from './enhanced_logger';
export { default as originalLogger } from './axiom_logger';
export { LoggerConfig, loadLoggerConfig } from './logger_config';
