import express from 'express';
import matchesController from '../controllers/matches_controller';

const router = express();

router.get('/featured', matchesController.getFeaturedMatch);
router.get('/:id/details', matchesController.getMatchDetails);

export default router;

