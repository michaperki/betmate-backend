/**
 * Twitter Service
 * Handles interactions with the Twitter API
 *
 * Note: This service requires the twitter-api-v2 package
 * Uses environment variable ENABLE_TWITTER=true to activate
 */

import logger from '../helpers/axiom_logger';

// Only import the Twitter API if enabled
let TwitterApi: any;
const ENABLE_TWITTER = process.env.ENABLE_TWITTER === 'true';

if (ENABLE_TWITTER) {
  try {
    // Dynamic import to avoid errors when package isn't available
    // Will only execute if ENABLE_TWITTER is true
    ({ TwitterApi } = require('twitter-api-v2'));
  } catch (error) {
    logger.warn('Failed to import twitter-api-v2 package:', error);
  }
}

// Environment variable names
const TWITTER_API_KEY = process.env.TWITTER_API_KEY || '';
const TWITTER_API_SECRET = process.env.TWITTER_API_SECRET || '';
const TWITTER_ACCESS_TOKEN = process.env.TWITTER_ACCESS_TOKEN || '';
const TWITTER_ACCESS_SECRET = process.env.TWITTER_ACCESS_SECRET || '';
const TWITTER_CLIENT_ID = process.env.TWITTER_CLIENT_ID || '';
const TWITTER_CLIENT_SECRET = process.env.TWITTER_CLIENT_SECRET || '';

// Check if Twitter credentials are configured
const isConfigured = () => {
  if (!ENABLE_TWITTER) {
    logger.info('Twitter integration is disabled by environment variable');
    return false;
  }

  const hasOAuth1Credentials = TWITTER_API_KEY && TWITTER_API_SECRET &&
                            TWITTER_ACCESS_TOKEN && TWITTER_ACCESS_SECRET;

  const hasOAuth2Credentials = TWITTER_CLIENT_ID && TWITTER_CLIENT_SECRET;

  const hasCredentials = hasOAuth1Credentials || hasOAuth2Credentials;

  if (!hasCredentials) {
    logger.warn('Twitter API credentials not configured');
  }

  return hasCredentials && TwitterApi !== undefined;
};

// Initialize Twitter client
const initializeClient = () => {
  if (!isConfigured()) {
    return null;
  }

  try {
    // OAuth 1.0a authentication (for v1 and v2 endpoints)
    if (TWITTER_API_KEY && TWITTER_API_SECRET && TWITTER_ACCESS_TOKEN && TWITTER_ACCESS_SECRET) {
      return new TwitterApi({
        appKey: TWITTER_API_KEY,
        appSecret: TWITTER_API_SECRET,
        accessToken: TWITTER_ACCESS_TOKEN,
        accessSecret: TWITTER_ACCESS_SECRET,
      });
    }

    // OAuth 2.0 app-only authentication (for v2 endpoints only)
    if (TWITTER_CLIENT_ID && TWITTER_CLIENT_SECRET) {
      return new TwitterApi({
        clientId: TWITTER_CLIENT_ID,
        clientSecret: TWITTER_CLIENT_SECRET,
      });
    }

    return null;
  } catch (error) {
    logger.error('Error initializing Twitter client:', error);
    return null;
  }
};

/**
 * Posts a tweet about a new game starting
 * @param gameId The ID of the game
 * @param whitePlayer Name of white player
 * @param blackPlayer Name of black player
 * @param timeControl Time control of the game
 * @returns Promise resolving to tweet data or null if posting failed
 */
const tweetNewGame = async (
  gameId: string,
  whitePlayer: string,
  blackPlayer: string,
  timeControl: string
) => {
  const client = initializeClient();
  if (!client) return null;

  try {
    const gameUrl = `https://betmate-prod.netlify.app/game/${gameId}`;
    const tweetText = `🎮 New game started! ${whitePlayer} (White) vs ${blackPlayer} (Black) with ${timeControl} time control. Watch and bet live at ${gameUrl} #chess #betting`;

    // Use the Twitter API if available
    let result;
    if (TwitterApi) {
      const v2Client = client.v2;
      result = await v2Client.tweet(tweetText);
    } else {
      // Mock result if Twitter API is not available
      logger.info(`Would tweet (mock): ${tweetText}`);
      result = { data: { id: `mock-${Date.now()}` } };
    }

    logger.info(`Tweet posted for new game ${gameId}`, { tweetId: result.data.id });
    return result.data;
  } catch (error) {
    logger.error(`Failed to tweet about new game ${gameId}:`, error);
    return null;
  }
};

/**
 * Posts a tweet about game results
 * @param gameId The ID of the game
 * @param whitePlayer Name of white player
 * @param blackPlayer Name of black player
 * @param result The game result (e.g., "1-0", "0-1", "1/2-1/2")
 * @returns Promise resolving to tweet data or null if posting failed
 */
const tweetGameResult = async (
  gameId: string,
  whitePlayer: string,
  blackPlayer: string,
  result: string
) => {
  const client = initializeClient();
  if (!client) return null;

  try {
    let resultText = '';
    switch (result) {
      case '1-0':
        resultText = `${whitePlayer} (White) won against ${blackPlayer}`;
        break;
      case '0-1':
        resultText = `${blackPlayer} (Black) won against ${whitePlayer}`;
        break;
      case '1/2-1/2':
        resultText = `${whitePlayer} and ${blackPlayer} played to a draw`;
        break;
      default:
        resultText = `Game between ${whitePlayer} and ${blackPlayer} ended with result: ${result}`;
    }

    const gameUrl = `https://betmate-prod.netlify.app/game/${gameId}`;
    const tweetText = `🏁 Game finished! ${resultText}. See final positions and betting results at ${gameUrl} #chess #betting`;

    // Use the Twitter API if available
    let result2;
    if (TwitterApi) {
      const v2Client = client.v2;
      result2 = await v2Client.tweet(tweetText);
    } else {
      // Mock result if Twitter API is not available
      logger.info(`Would tweet (mock): ${tweetText}`);
      result2 = { data: { id: `mock-${Date.now()}` } };
    }

    logger.info(`Tweet posted for game ${gameId} result`, { tweetId: result2.data.id });
    return result2.data;
  } catch (error) {
    logger.error(`Failed to tweet about game ${gameId} result:`, error);
    return null;
  }
};

/**
 * Posts a tweet about a significant betting event
 * @param gameId The ID of the game
 * @param message The message about the betting event
 * @returns Promise resolving to tweet data or null if posting failed
 */
const tweetBettingEvent = async (gameId: string, message: string) => {
  const client = initializeClient();
  if (!client) return null;

  try {
    const gameUrl = `https://betmate-prod.netlify.app/game/${gameId}`;
    const tweetText = `💰 ${message}. Follow the action at ${gameUrl} #chess #betting`;

    // Use the Twitter API if available
    let result;
    if (TwitterApi) {
      const v2Client = client.v2;
      result = await v2Client.tweet(tweetText);
    } else {
      // Mock result if Twitter API is not available
      logger.info(`Would tweet (mock): ${tweetText}`);
      result = { data: { id: `mock-${Date.now()}` } };
    }

    logger.info(`Tweet posted for betting event in game ${gameId}`, { tweetId: result.data.id });
    return result.data;
  } catch (error) {
    logger.error(`Failed to tweet about betting event in game ${gameId}:`, error);
    return null;
  }
};

const twitterService = {
  isConfigured,
  tweetNewGame,
  tweetGameResult,
  tweetBettingEvent
};

export default twitterService;