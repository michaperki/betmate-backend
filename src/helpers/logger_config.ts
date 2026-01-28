/**
 * Centralized logger configuration for Betmate backend
 * 
 * This file provides standardized configuration for logging across
 * the application to ensure consistency and manage verbosity.
 */

export interface LoggerConfig {
  // Basic configuration
  minLevel: 'debug' | 'info' | 'warn' | 'error';
  service: string;
  dataset: string;
  
  // Development experience
  prettyPrint: boolean;
  enableColors: boolean;
  
  // Sampling configuration
  requestSampleRate: number;
  slowRequestThreshold: number;
  pollingSlowRequestThreshold: number;
  
  // Feature-specific log filters
  mutedEvents: string[];
  verboseFeatures: string[];

  // Context enrichment
  includePerformanceMetrics: boolean;
  includeResourceMetrics: boolean;
}

// Default configuration values
const defaultConfig: LoggerConfig = {
  minLevel: 'info',
  service: 'backend',
  dataset: 'betmate-logs',
  prettyPrint: false,
  enableColors: false,
  requestSampleRate: 0.05,
  slowRequestThreshold: 1000,
  pollingSlowRequestThreshold: 500,
  mutedEvents: [],
  verboseFeatures: [],
  includePerformanceMetrics: false,
  includeResourceMetrics: false
};

// Development environment configuration
const developmentConfig: Partial<LoggerConfig> = {
  minLevel: 'debug',
  prettyPrint: true,
  enableColors: true,
  requestSampleRate: 0.1,
  slowRequestThreshold: 2000,
  pollingSlowRequestThreshold: 1000,
  // Mute noisy events in development
  mutedEvents: [
    'featured_candidate_scored',
    'wdl_timeout',
    'top_moves_timeout'
  ],
  verboseFeatures: []
};

// Production environment configuration
const productionConfig: Partial<LoggerConfig> = {
  minLevel: 'info',
  prettyPrint: false,
  enableColors: false,
  requestSampleRate: 0.01,
  includePerformanceMetrics: true,
  includeResourceMetrics: true
};

// Testing environment configuration
const testConfig: Partial<LoggerConfig> = {
  minLevel: 'error',
  prettyPrint: false,
  enableColors: false,
  requestSampleRate: 0,
  mutedEvents: ['*'] // Mute all events except errors in testing
};

/**
 * Load configuration based on environment with environment variable overrides
 */
export function loadLoggerConfig(): LoggerConfig {
  const env = process.env.NODE_ENV || 'development';
  
  // Start with default config
  let config = { ...defaultConfig };
  
  // Apply environment-specific overrides
  if (env === 'development') {
    config = { ...config, ...developmentConfig };
  } else if (env === 'production') {
    config = { ...config, ...productionConfig };
  } else if (env === 'test') {
    config = { ...config, ...testConfig };
  }
  
  // Apply environment variable overrides
  if (process.env.LOG_LEVEL) {
    const level = process.env.LOG_LEVEL.toLowerCase();
    if (['debug', 'info', 'warn', 'error'].includes(level)) {
      config.minLevel = level as 'debug' | 'info' | 'warn' | 'error';
    }
  }
  
  if (process.env.LOG_PRETTY_PRINT) {
    config.prettyPrint = process.env.LOG_PRETTY_PRINT === 'true';
  }
  
  if (process.env.LOG_COLORS) {
    config.enableColors = process.env.LOG_COLORS === 'true';
  }
  
  if (process.env.LOG_REQUEST_SAMPLE_RATE) {
    const rate = parseFloat(process.env.LOG_REQUEST_SAMPLE_RATE);
    if (!isNaN(rate) && rate >= 0 && rate <= 1) {
      config.requestSampleRate = rate;
    }
  }
  
  if (process.env.LOG_SLOW_MS) {
    const threshold = parseInt(process.env.LOG_SLOW_MS, 10);
    if (!isNaN(threshold) && threshold > 0) {
      config.slowRequestThreshold = threshold;
    }
  }
  
  if (process.env.LOG_SLOW_MS_POLLING) {
    const threshold = parseInt(process.env.LOG_SLOW_MS_POLLING, 10);
    if (!isNaN(threshold) && threshold > 0) {
      config.pollingSlowRequestThreshold = threshold;
    }
  }
  
  if (process.env.LOG_MUTED_EVENTS) {
    config.mutedEvents = process.env.LOG_MUTED_EVENTS.split(',');
  }
  
  if (process.env.LOG_VERBOSE_FEATURES) {
    config.verboseFeatures = process.env.LOG_VERBOSE_FEATURES.split(',');
  }
  
  return config;
}

// Export a singleton instance of the config
export const loggerConfig = loadLoggerConfig();
export default loggerConfig;