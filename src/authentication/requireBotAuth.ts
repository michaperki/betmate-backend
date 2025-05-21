import { Request, Response, NextFunction } from 'express';

/**
 * Middleware to authenticate bot service API requests
 * using a shared secret key header.
 */
export const requireBotAuth = (req: Request, res: Response, next: NextFunction) => {
  // Quiet mode - no logging for normal operation
  const botApiKey = process.env.BOT_API_KEY;

  // If BOT_API_KEY is not configured, bot authentication is disabled
  if (!botApiKey) {
    console.warn('BOT_API_KEY is not configured in environment variables');
    return res.status(500).json({ error: 'Bot API authentication is not configured' });
  }

  // Get the API key from the request header
  const requestApiKey = req.header('X-Bot-Api-Key');

  // Check if the API key is provided and matches
  if (!requestApiKey || requestApiKey !== botApiKey) {
    console.warn('Bot authentication failed: Invalid or missing API key');
    return res.status(401).json({ error: 'Unauthorized bot API request' });
  }

  // Add a flag to the request indicating this is a bot request
  req.body.isBot = true;
  req.body.skip_game_check = true;  // Always skip game check for bot wagers

  // Authentication successful, proceed
  next();
};