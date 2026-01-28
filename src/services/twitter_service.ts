/**
 * Twitter Service
 * Handles interactions with the Twitter API
 * 
 * Simplified to only tweet about new games with a limit of 5 tweets per day.
 *
 * Note: This service requires the twitter-api-v2 package
 * Uses environment variable ENABLE_TWITTER=true to activate
 */

import logger from '../helpers/axiom_logger';
import tweetQueue from '../helpers/tweet_queue';

const twitterDebug = process.env.LOG_TWITTER_DEBUG === 'true';
if (twitterDebug) {
  logger.log({ level: 'debug', event: 'twitter_init', context: { ENABLE_TWITTER_ENV: process.env.ENABLE_TWITTER, NODE_ENV: process.env.NODE_ENV } });
}

// Only import the Twitter API if enabled
let TwitterApi: any;
const ENABLE_TWITTER = process.env.ENABLE_TWITTER === 'true';
if (twitterDebug) {
  logger.log({ level: 'debug', event: 'twitter_flag', context: { ENABLE_TWITTER } });
}

if (ENABLE_TWITTER) {
  try {
    // Dynamic import to avoid errors when package isn't available
    // Will only execute if ENABLE_TWITTER is true
    if (twitterDebug) logger.log({ level: 'debug', event: 'twitter_pkg_import_attempt' });
    ({ TwitterApi } = require('twitter-api-v2'));
    if (twitterDebug) logger.log({ level: 'debug', event: 'twitter_pkg_import_success' });
  } catch (error) {
    if (twitterDebug) logger.log({ level: 'debug', event: 'twitter_pkg_import_failed', context: { error: (error as any).message } });
    logger.log({ level: 'warn', event: 'twitter_pkg_import_failed', context: { error: (error as any).message } });
  }
} else {
  if (twitterDebug) logger.log({ level: 'debug', event: 'twitter_pkg_import_skipped' });
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
    logger.log({ level: 'info', event: 'twitter_disabled' });
    return false;
  }

  const hasOAuth1Credentials = TWITTER_API_KEY && TWITTER_API_SECRET &&
                            TWITTER_ACCESS_TOKEN && TWITTER_ACCESS_SECRET;
  const hasOAuth2Credentials = TWITTER_CLIENT_ID && TWITTER_CLIENT_SECRET;
  const hasCredentials = hasOAuth1Credentials || hasOAuth2Credentials;

  if (!hasCredentials) {
    logger.log({ level: 'warn', event: 'twitter_missing_credentials' });
  }

  const result = hasCredentials && TwitterApi !== undefined;
  if (twitterDebug) {
    logger.log({ level: 'debug', event: 'twitter_config_check', context: { hasOAuth1Credentials, hasOAuth2Credentials, hasCredentials, TwitterApiLoaded: TwitterApi !== undefined, result } });
  }
  return result;
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
 * Actually posts a tweet about a new game starting (internal implementation)
 * @param gameId The ID of the game
 * @param whitePlayer Name of white player
 * @param blackPlayer Name of black player
 * @param timeControl Time control of the game
 * @returns Promise resolving to tweet data or null if posting failed
 */
const _sendTweet = async (
  gameId: string,
  whitePlayer: string,
  blackPlayer: string,
  timeControl: string
) => {
  const client = initializeClient();
  if (!client) return null;

  try {
    const gameUrl = `https://betmate-prod.netlify.app/chess/${gameId}`;
    const tweetText = `🎮 New game started! ${whitePlayer} (White) vs ${blackPlayer} (Black) with ${timeControl} time control. Watch and bet live at ${gameUrl} #chess #betting`;

    // Use the Twitter API if available
    let result;
    if (TwitterApi) {
      console.log(`Sending new game tweet via Twitter API: "${tweetText}"`);
      const v2Client = client.v2;
      result = await v2Client.tweet(tweetText);
      console.log(`Twitter API response for new game:`, result);
    } else {
      // Mock result if Twitter API is not available
      console.log(`Would tweet new game (mock): "${tweetText}"`);
      logger.info(`Would tweet (mock): ${tweetText}`);
      result = { data: { id: `mock-${Date.now()}` } };
    }

    logger.info(`Tweet posted for new game ${gameId}`, { tweetId: result.data.id });
    return result.data;
  } catch (error) {
    console.error(`Failed to tweet about new game ${gameId}:`, error);
    logger.error(`Failed to tweet about new game ${gameId}:`, error);
    return null;
  }
};

/**
 * Queues a tweet about a new game starting
 * @param gameId The ID of the game
 * @param whitePlayer Name of white player
 * @param blackPlayer Name of black player
 * @param timeControl Time control of the game
 * @returns Promise resolving to true if queued successfully
 */
const tweetNewGame = async (
  gameId: string,
  whitePlayer: string,
  blackPlayer: string,
  timeControl: string
) => {
  if (!isConfigured()) return null;
  
  logger.info(`Queuing new game tweet for game ${gameId}`);
  
  // Add the tweet to the queue
  tweetQueue.queueTweet(
    gameId,
    { whitePlayer, blackPlayer, timeControl },
    _sendTweet
  );
  
  // Return a mock result since the actual tweet will be sent later
  return { id: `queued-${Date.now()}` };
};


/**
 * Get current tweet queue status
 * @returns Queue status information
 */
const getTweetQueueStatus = () => {
  return tweetQueue.getQueueStatus();
};

const twitterService = {
  isConfigured,
  tweetNewGame,
  getTweetQueueStatus
};

export default twitterService;
