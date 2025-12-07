import * as axiom from '@axiomhq/axiom-node';

/**
 * AxiomLogger - A utility for logging events to Axiom
 * 
 * This module provides logging functionality using Axiom's Node.js SDK.
 * It automatically reads the API key from the AXIOM_API_KEY environment variable.
 * Uses lazy initialization to ensure environment variables are loaded first.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEvent {
  level: LogLevel;
  message?: string;
  event: string;
  service?: string;
  trace_id?: string;
  env?: string;
  context?: Record<string, any>;
}

class AxiomLogger {
  private client?: axiom.Client;
  private dataset: string;
  private isInitialized: boolean = false;
  private service: string;
  private env: string;
  private minLevel: number;

  constructor(dataset: string = 'betmate-logs', service: string = 'backend') {
    this.dataset = dataset;
    this.service = service;
    this.env = process.env.NODE_ENV || 'development';
    const configuredLevel = (process.env.LOG_LEVEL || (this.env === 'development' ? 'info' : 'warn')).toLowerCase();
    this.minLevel = this.getLevelWeight(this.normalizeLevel(configuredLevel));
  }

  private levelWeights: Record<LogLevel, number> = {
    debug: 10,
    info: 20,
    warn: 30,
    error: 40,
  };

  private normalizeLevel(level: string): LogLevel {
    if (['debug', 'info', 'warn', 'error'].includes(level)) {
      return level as LogLevel;
    }
    return 'info';
  }

  private getLevelWeight(level: LogLevel): number {
    return this.levelWeights[level] ?? this.levelWeights.info;
  }

  private shouldLog(level: LogLevel): boolean {
    return this.getLevelWeight(level) >= this.minLevel;
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
      // Reduce noise: avoid info logs in production
      if (env !== 'production') {
        console.log('Axiom logging initialized');
      }
    } else if (!apiKey) {
      console.warn('Axiom logging disabled: No AXIOM_API_KEY found in environment');
    } else {
      console.log('Axiom logging disabled in development environment');
    }

    this.isInitialized = true;
  }

  /**
   * Log an event to Axiom
   */
  async log(event: LogEvent): Promise<void> {
    if (!this.shouldLog(event.level)) {
      return;
    }

    // Initialize on first use
    if (!this.isInitialized) {
      this.initialize();
    }

    // Create structured log entry
    const logEntry = {
      ts: new Date().toISOString(),
      level: event.level,
      service: event.service || this.service,
      env: event.env || this.env,
      event: event.event,
      trace_id: event.trace_id,
      message: event.message,
      ...event.context
    };

    if (!this.client) {
      // Fall back to structured console logging if Axiom is not configured
      // Only show debug logs in development
      if (typeof console[event.level] === 'function') {
        console[event.level](JSON.stringify(logEntry));
      } else {
        console.log(JSON.stringify(logEntry));
      }
      return;
    }

    try {
      await this.client.ingestEvents(this.dataset, [logEntry]);
    } catch (error) {
      console.error('Failed to log to Axiom:', error);
      // Fall back to console logging
      if (typeof console[event.level] === 'function') {
        console[event.level](JSON.stringify(logEntry));
      } else {
        console.log(JSON.stringify(logEntry));
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
}

// Create and export a singleton instance
const logger = new AxiomLogger();
export default logger;
