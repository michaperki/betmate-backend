import * as axiom from '@axiomhq/axiom-node';
import { getRequestId } from './request_context';
import loggerConfig, { LoggerConfig } from './logger_config';
import chalk from 'chalk';

/**
 * EnhancedLogger - An improved logger with better development experience
 * 
 * This logger extends the functionality of the original AxiomLogger:
 * - Better development console output with colors and formatting
 * - Configurable event filtering to reduce noise
 * - Performance metric tracking
 * - Maintains backward compatibility with original API
 */

export interface LogEvent {
  level: 'info' | 'warn' | 'error' | 'debug';
  message?: string;
  event: string;
  service?: string;
  trace_id?: string;
  env?: string;
  context?: Record<string, any>;
}

interface PerformanceMetrics {
  heapUsed: number;
  heapTotal: number;
  uptime: number;
}

class EnhancedLogger {
  private client?: axiom.Client;
  private config: LoggerConfig;
  private isInitialized: boolean = false;
  private env: string;
  private eventCounts: Record<string, number> = {};

  constructor(config: LoggerConfig) {
    this.config = config;
    this.env = process.env.NODE_ENV || 'development';
  }
  
  /**
   * Initialize the logger - called on first use to ensure environment variables are loaded
   */
  private initialize(): void {
    if (this.isInitialized) return;

    const apiKey = process.env.AXIOM_API_KEY;
    const env = process.env.NODE_ENV || 'development';

    // Only initialize Axiom client in production or if explicitly enabled
    if (apiKey && (env === 'production' || process.env.ENABLE_AXIOM_LOGGING === 'true')) {
      this.client = new axiom.Client({
        token: apiKey
      });
      
      if (env === 'production') {
        console.log(`Axiom logging initialized successfully for ${env} environment`);
      } else {
        this.prettyLog('info', 'logging', 'Axiom logging initialized successfully', { environment: env });
      }
    } else if (!apiKey) {
      if (env === 'development') {
        this.prettyLog('warn', 'logging', 'Axiom logging disabled: No AXIOM_API_KEY found in environment');
      } else {
        console.warn('Axiom logging disabled: No AXIOM_API_KEY found in environment');
      }
    } else {
      if (env === 'development') {
        this.prettyLog('info', 'logging', 'Development mode: logging to console only', { axiom_enabled: false });
      } else {
        console.log('Axiom logging disabled in development environment');
      }
    }

    this.isInitialized = true;
  }

  /**
   * Format logs for better console readability in development
   */
  private prettyLog(level: string, event: string, message?: string, context?: Record<string, any>): void {
    if (!this.config.prettyPrint || !this.config.enableColors) {
      console[level](`[${event}] ${message || ''}`, context || '');
      return;
    }

    // Skip if this is a muted event in development mode
    if (this.shouldMuteEvent(event)) {
      // Track counts of muted events
      this.eventCounts[event] = (this.eventCounts[event] || 0) + 1;
      return;
    }
    
    // Format based on log level
    let prefix = '';
    switch (level) {
      case 'info':
        prefix = chalk.blue('[INFO]');
        break;
      case 'warn':
        prefix = chalk.yellow('[WARN]');
        break;
      case 'error':
        prefix = chalk.red('[ERROR]');
        break;
      case 'debug':
        prefix = chalk.gray('[DEBUG]');
        break;
      default:
        prefix = `[${level.toUpperCase()}]`;
    }

    // Format event name
    const eventStr = chalk.green(`[${event}]`);
    
    // Format message
    const msgStr = message || '';
    
    // Format context if present
    let contextStr = '';
    if (context && Object.keys(context).length > 0) {
      contextStr = chalk.gray(JSON.stringify(context, null, 0));
    }
    
    // Log with formatting
    console[level](`${prefix} ${eventStr} ${msgStr} ${contextStr}`);
  }

  /**
   * Check if an event should be muted based on configuration
   */
  private shouldMuteEvent(event: string): boolean {
    if (this.config.mutedEvents.includes('*')) {
      return !this.config.verboseFeatures.some(feature => event.startsWith(feature));
    }
    
    return this.config.mutedEvents.includes(event);
  }

  /**
   * Get performance metrics if configured
   */
  private getPerformanceMetrics(): PerformanceMetrics | null {
    if (!this.config.includePerformanceMetrics) return null;
    
    try {
      const memUsage = process.memoryUsage();
      return {
        heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024 * 100) / 100, // MB with 2 decimal places
        heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024 * 100) / 100, // MB with 2 decimal places
        uptime: Math.round(process.uptime() * 100) / 100 // seconds with 2 decimal places
      };
    } catch (e) {
      return null;
    }
  }

  /**
   * Log an event
   */
  async log(event: LogEvent): Promise<void> {
    // Initialize on first use
    if (!this.isInitialized) {
      this.initialize();
    }

    // Skip if we should mute this event
    if (this.shouldMuteEvent(event.event)) {
      this.eventCounts[event.event] = (this.eventCounts[event.event] || 0) + 1;
      return;
    }

    // Check if we should log based on level
    if (!this.shouldLog(event.level)) {
      return;
    }

    // Get performance metrics if configured
    const metrics = this.getPerformanceMetrics();
    
    // Create structured log entry
    const logEntry = {
      ts: new Date().toISOString(),
      level: event.level,
      service: event.service || this.config.service,
      env: event.env || this.env,
      event: event.event,
      trace_id: event.trace_id || getRequestId(),
      message: event.message,
      ...event.context,
      ...(metrics ? { performance: metrics } : {})
    };

    // Handle development pretty printing
    if (this.env === 'development' && this.config.prettyPrint) {
      this.prettyLog(event.level, event.event, event.message, { ...event.context, ...(metrics ? { performance: metrics } : {}) });
      
      // In development, we may only want to log to console unless Axiom is explicitly enabled
      if (!process.env.ENABLE_AXIOM_LOGGING) {
        return;
      }
    } else if (!this.client) {
      // Fall back to structured console logging if Axiom is not configured
      console[event.level](JSON.stringify(logEntry));
      return;
    }

    // Send to Axiom if client is configured
    if (this.client) {
      try {
        await this.client.ingestEvents(this.config.dataset, [logEntry]);
      } catch (error) {
        console.error('Failed to log to Axiom:', error);
        // Fall back to console logging
        if (this.env === 'development' && this.config.prettyPrint) {
          this.prettyLog(event.level, 'axiom_error', 'Failed to log to Axiom', { original_event: event.event });
        } else {
          console[event.level](JSON.stringify(logEntry));
        }
      }
    }
  }

  /**
   * Log an informational message (backwards compatibility)
   */
  async info(message: string, context?: Record<string, any>): Promise<void> {
    return this.log({ level: 'info', event: 'legacy_log', message, context });
  }

  /**
   * Log a warning message (backwards compatibility)
   */
  async warn(message: string, context?: Record<string, any>): Promise<void> {
    return this.log({ level: 'warn', event: 'legacy_log', message, context });
  }

  /**
   * Log an error message (backwards compatibility)
   */
  async error(message: string, context?: Record<string, any>): Promise<void> {
    return this.log({ level: 'error', event: 'legacy_log', message, context });
  }

  /**
   * Log a debug message (backwards compatibility)
   */
  async debug(message: string, context?: Record<string, any>): Promise<void> {
    return this.log({ level: 'debug', event: 'legacy_log', message, context });
  }

  /**
   * Generate a new trace ID for request correlation
   */
  generateTraceId(): string {
    return Math.random().toString(36).substring(2, 10);
  }

  /**
   * Log counts of muted events (useful for development)
   */
  logMutedEventCounts(): void {
    if (Object.keys(this.eventCounts).length === 0) return;
    
    const counts = { ...this.eventCounts };
    this.eventCounts = {}; // Reset counts
    
    this.prettyLog('info', 'muted_events', 'Muted event counts (not sent to Axiom)', counts);
  }

  /**
   * Determine if a log of given level should be emitted based on configured min level
   */
  private shouldLog(level: 'debug' | 'info' | 'warn' | 'error'): boolean {
    const order = { debug: 10, info: 20, warn: 30, error: 40 } as const;
    return order[level] >= order[this.config.minLevel];
  }
}

// Create and export a singleton instance
const logger = new EnhancedLogger(loggerConfig);

// Periodically log muted event counts in development
if (process.env.NODE_ENV === 'development') {
  setInterval(() => {
    logger.logMutedEventCounts();
  }, 60000); // Log muted event counts every minute
}

export default logger;