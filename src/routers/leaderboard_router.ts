import bodyParser from 'body-parser';
import express from 'express';
import { createValidator } from 'express-joi-validation';

import { requireAuth } from 'authentication';
import leaderboardController from 'controllers/leaderboard_controller';
import { GetLeaderboardSchema } from 'validation/leaderboard';
import { validateRequest } from 'validation';

const router = express();
const validator = createValidator({ passError: true });

// TODO: Move middleware attachment to test file
if (process.env.NODE_ENV === 'test') {
  // enable json message body for posting data to router
  router.use(bodyParser.urlencoded({ extended: true }));
  router.use(bodyParser.json());
}

router.route('/')
  .get(
    validator.query(GetLeaderboardSchema),
    validateRequest,
    leaderboardController.getLeaderboardRequest,
  );

router.route('/userrank')
  .get(
    requireAuth,
    leaderboardController.getUserRankingRequest,
  );

router.route('/create-leaderboard')
  .get(leaderboardController.createLeaderboard);

export default router;
