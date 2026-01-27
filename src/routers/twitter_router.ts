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
 * @route GET /api/twitter/queue
 * @description Get the status of the tweet queue
 * @access Private (Admin)
 */
router.get('/queue', requireAuth, twitterController.getTweetQueueStatus);

/**
 * @route POST /api/twitter/tweet/game
 * @description Post a tweet about a new game
 * @access Private (Admin)
 */
router.post('/tweet/game', requireAuth, twitterController.tweetNewGame);

export default router;
