import express from 'express';
import { optionalAuth } from '../authentication/requireAuth';
import realMarketController from '../controllers/real_market_controller';

const router = express();

// Read-only prices for Phase 1
router.get('/:gameId', optionalAuth, realMarketController.getWdlMarket);

export default router;

