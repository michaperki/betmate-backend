import { Router } from 'express';
import { getCurrentRaffle, optInToRaffle, getRaffleHistory, createTestRaffleData } from '../controllers/raffle_controller';
import requireAuth, { optionalAuth } from '../authentication/requireAuth';

const router = Router();

// GET /current - Get current active raffle information
router.get('/current', optionalAuth, getCurrentRaffle);

// POST /opt-in - Opt into current raffle (requires auth)
router.post('/opt-in', requireAuth, optInToRaffle);

// GET /history - Get raffle history
router.get('/history', getRaffleHistory);

// POST /create-test-data - Create test raffle data (development only)
router.post('/create-test-data', createTestRaffleData);

export default router;