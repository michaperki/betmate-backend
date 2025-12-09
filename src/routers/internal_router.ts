import express from 'express';
import { wagerController } from '../controllers';
import { requireBotAuth } from '../authentication';

const router = express.Router();

/**
 * Internal Routes
 * 
 * These routes are for internal service-to-service communication and are not
 * exposed to the public API. They are authenticated using a shared secret key.
 */

/**
 * @route POST /internal/bot_wager
 * @description Submit a wager from the house bot service
 * @access Private (requires bot authentication)
 */
router.post('/bot_wager', requireBotAuth, wagerController.createBotWager);

export default router;
