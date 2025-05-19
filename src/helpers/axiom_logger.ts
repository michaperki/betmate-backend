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
  message: string;
  context?: Record<string, any>;
}

class AxiomLogger {
  private client?: axiom.Client;
  private dataset: string;
  private isInitialized: boolean = false;

  constructor(dataset: string = 'betmate-logs') {
    this.dataset = dataset;
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
    
    if (!this.client) {
      // Fall back to console logging if Axiom is not configured
      const { level, message, context } = event;
      console[level](message, context || '');
      return;
    }

    try {
      await this.client.ingestEvents(this.dataset, [
        {
          _time: new Date().toISOString(),
          level: event.level,
          message: event.message,
          ...event.context
        }
      ]);
    } catch (error) {
      console.error('Failed to log to Axiom:', error);
      // Fall back to console logging
      const { level, message, context } = event;
      console[level](message, context || '');
    }
  }

  /**
   * Log an informational message
   */
  async info(message: string, context?: Record<string, any>): Promise<void> {
    return this.log({ level: 'info', message, context });
  }

  /**
   * Log a warning message
   */
  async warn(message: string, context?: Record<string, any>): Promise<void> {
    return this.log({ level: 'warn', message, context });
  }

  /**
   * Log an error message
   */
  async error(message: string, context?: Record<string, any>): Promise<void> {
    return this.log({ level: 'error', message, context });
  }

  /**
   * Log a debug message
   */
  async debug(message: string, context?: Record<string, any>): Promise<void> {
    return this.log({ level: 'debug', message, context });
  }
}

// Create and export a singleton instance
const logger = new AxiomLogger();
export default logger;