import bodyParser from 'body-parser';
import express from 'express';
import { createValidator } from 'express-joi-validation';

import { analysisController } from '../controllers';
import { GetMoveAnalysisSchema } from '../validation/analysis';
import { handleValidationError } from '../validation';

const router = express();
const validator = createValidator({ passError: true });

// TODO: Move middleware attachment to test file
if (process.env.NODE_ENV === 'test') {
  // enable json message body for posting data to router
  router.use(bodyParser.urlencoded({ extended: true }));
  router.use(bodyParser.json());
}

router
  .route('/move')
  .get(
    validator.query(GetMoveAnalysisSchema),
    analysisController.getMoveAnalysisRequest,
  );

if (process.env.NODE_ENV === 'test') {
  router.use(handleValidationError);
}

export default router;