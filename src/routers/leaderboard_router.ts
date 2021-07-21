import bodyParser from 'body-parser';
import express from 'express';
import { createValidator } from 'express-joi-validation';

import { requireAuth } from 'authentication';
import leaderboardController from 'controllers/leaderboard_controller';
import { GetLeaderboardSchema, GetUserRankSchema } from 'validation/leaderboard';
import { handleValidationError } from 'validation';

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
    leaderboardController.getLeaderboardRequest,
  );

router.route('/userrank')
  .get(
    requireAuth,
    validator.query(GetUserRankSchema),
    leaderboardController.getUserRankingRequest,
  );

if (process.env.NODE_ENV === 'test') {
  router.use(handleValidationError);
}

export default router;
