import express from 'express';
import mongoose from 'mongoose';
import opsMetrics from '../utils/ops_metrics';
import { getPublicRuntimeConfig } from '../config/runtime';
import { requireAdminKey } from '../authentication';

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
// bot_wager removed

/**
 * @route GET /internal/metrics
 * @description Lightweight counters and config snapshot for internal consumers
 * @access Private (requires bot authentication)
 */
router.get('/metrics', requireAdminKey, (_req, res) => {
  const dbOk = mongoose.connection?.readyState === 1 || mongoose.connection?.readyState === 2;
  const counters = opsMetrics.get();
  const cfg = getPublicRuntimeConfig();
  res.status(200).json({
    db: dbOk ? 'ok' : 'down',
    rateLimitCounters: counters,
    config: cfg,
    uptime_ms: Math.round(process.uptime() * 1000),
  });
});

export default router;
