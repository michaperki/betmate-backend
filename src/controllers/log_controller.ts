import { RequestHandler } from 'express';
import logger from '../helpers/axiom_logger';

/**
 * Handle client-side log events from the frontend
 * Acts as a proxy to Axiom, adding authentication and validation
 */
const clientLogRequest: RequestHandler = async (req, res) => {
  try {
    // Always return 200 in production if AXIOM_TOKEN is not configured
    // This prevents frontend errors while allowing for local development
    if (process.env.NODE_ENV === 'production' && !process.env.AXIOM_TOKEN) {
      return res.status(200).json({ message: 'Logging disabled in production' });
    }

    const { level, event, message, context } = req.body;

    // Validate required fields
    if (!level || !event) {
      return res.status(400).json({
        message: 'Missing required fields: level and event are required'
      });
    }

    // Validate log level
    if (!['debug', 'info', 'warn', 'error'].includes(level)) {
      return res.status(400).json({
        message: 'Invalid log level. Must be one of: debug, info, warn, error'
      });
    }

    // Add client IP and user agent for security/debugging
    const clientContext = {
      ...context,
      client_ip: req.ip,
      user_agent: req.headers['user-agent'],
      referer: req.headers.referer || req.headers.referrer
    };

    // Log to Axiom with client-side prefix to distinguish from server logs
    await logger.log({
      level,
      event: `client_${event}`,
      message,
      service: 'frontend',
      context: clientContext
    });

    return res.status(200).json({ message: 'Log recorded successfully' });
  } catch (error) {
    console.error('Error processing client log:', error);
    return res.status(500).json({ message: 'Failed to process log' });
  }
};

const logController = {
  clientLogRequest
};

export default logController;