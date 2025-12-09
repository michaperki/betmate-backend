import express from 'express';
import { wagerController } from '../controllers';
import userService from '../services/user_service';
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

/**
 * @route POST /internal/backfill_token_balance
 * @description Initialize token_balance from legacy account where missing/negative
 * @access Private (requires bot authentication)
 */
router.post('/backfill_token_balance', requireBotAuth, async (_req, res) => {
  try {
    const result = await userService.backfillTokenBalance();
    res.status(200).json({ ok: true, ...result });
  } catch (e) {
    res.status(500).json({ ok: false });
  }
});

export default router;
