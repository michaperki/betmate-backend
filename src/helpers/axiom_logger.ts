import * as axiom from '@axiomhq/axiom-node';

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

  constructor(dataset: string = 'betmate-logs', service: string = 'backend') {
    this.dataset = dataset;
    this.service = service;
    this.env = process.env.NODE_ENV || 'development';
  }
  
  /**
   * Initialize the logger - called on first use to ensure environment variables are loaded
   */
  private initialize(): void {
    if (this.isInitialized) return;
    
    const apiKey = process.env.AXIOM_API_KEY;
    
    if (apiKey) {
      this.client = new axiom.Client({
        token: apiKey
      });
      console.log('Axiom logging initialized successfully');
    } else {
      console.warn('Axiom logging disabled: No AXIOM_API_KEY found in environment');
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
      trace_id: event.trace_id,
      message: event.message,
      ...event.context
    };

    if (!this.client) {
      // Fall back to structured console logging if Axiom is not configured
      // Only show debug logs in development
      if (event.level === 'debug' && this.env === 'production') {
        return;
      }
      console[event.level](JSON.stringify(logEntry));
      return;
    }

    try {
      await this.client.ingestEvents(this.dataset, [logEntry]);
    } catch (error) {
      console.error('Failed to log to Axiom:', error);
      // Fall back to console logging
      console[event.level](JSON.stringify(logEntry));
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