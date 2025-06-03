/**
 * Twitter Router
 * Defines API routes for Twitter-related functionality
 */
import express from 'express';
import twitterController from '../controllers/twitter_controller';
import requireAuth from '../authentication/requireAuth';

const router = express.Router();

/**
 * @route GET /api/twitter/status
 * @description Check if Twitter API is properly configured
 * @access Public
 */
router.get('/status', twitterController.checkTwitterConfig);

/**
 * @route POST /api/twitter/tweet/game
 * @description Post a tweet about a new game
 * @access Private (Admin)
 */
router.post('/tweet/game', requireAuth, twitterController.tweetNewGame);

/**
 * @route POST /api/twitter/tweet/result
 * @description Post a tweet about game results
 * @access Private (Admin)
 */
router.post('/tweet/result', requireAuth, twitterController.tweetGameResult);

/**
 * @route POST /api/twitter/tweet/betting
 * @description Post a tweet about a significant betting event
 * @access Private (Admin)
 */
router.post('/tweet/betting', requireAuth, twitterController.tweetBettingEvent);

export default router;