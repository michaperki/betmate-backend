import * as axiom from '@axiomhq/axiom-node';
import { getRequestId } from './request_context';

/**
 * AxiomLogger - A utility for logging events to Axiom
 * 
 * This module provides logging functionality using Axiom's Node.js SDK.
 * It automatically reads the API key from the AXIOM_API_KEY environment variable.
 * Uses lazy initialization to ensure environment variables are loaded first.
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

class AxiomLogger {
  private client?: axiom.Client;
  private dataset: string;
  private isInitialized: boolean = false;
  private service: string;
  private env: string;
  private minLevel: 'debug' | 'info' | 'warn' | 'error';

  constructor(dataset: string = 'betmate-logs', service: string = 'backend') {
    this.dataset = dataset;
    this.service = service;
    this.env = process.env.NODE_ENV || 'development';
    // Configure minimum log level via env (defaults to info)
    const configured = (process.env.LOG_LEVEL || 'info').toLowerCase();
    if (configured === 'debug' || configured === 'info' || configured === 'warn' || configured === 'error') {
      this.minLevel = configured;
    } else {
      this.minLevel = 'info';
    }
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
      console.log(`Axiom logging initialized successfully for ${env} environment`);
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
      trace_id: event.trace_id || getRequestId(),
      message: event.message,
      ...event.context
    };

    if (!this.client) {
      // Fall back to structured console logging if Axiom is not configured
      // Filter by configured level even in development
      if (!this.shouldLog(event.level)) return;
      console[event.level](JSON.stringify(logEntry));
      return;
    }

    try {
      // Respect level filter even when using Axiom client
      if (!this.shouldLog(event.level)) return;
      await this.client.ingestEvents(this.dataset, [logEntry]);
    } catch (error) {
      console.error('Failed to log to Axiom:', error);
      // Fall back to console logging
      if (this.shouldLog(event.level)) {
        console[event.level](JSON.stringify(logEntry));
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
   * Determine if a log of given level should be emitted based on configured min level
   */
  private shouldLog(level: 'debug' | 'info' | 'warn' | 'error'): boolean {
    const order = { debug: 10, info: 20, warn: 30, error: 40 } as const;
    return order[level] >= order[this.minLevel];
  }
}

// Create and export a singleton instance
const logger = new AxiomLogger();
export default logger;
