import bodyParser from 'body-parser';
import express from 'express';
import { createValidator } from 'express-joi-validation';

import { requireAuth } from '../authentication';
import { wagerController } from '../controllers';
import { CreateWagerSchema, GetWagersSchema } from '../validation/wager';
import { handleValidationError } from '../validation';

const router = express();
const validator = createValidator({ passError: true });

// TODO: Move middleware attachment to test file
if (process.env.NODE_ENV === 'test') {
  // enable json message body for posting data to router
  router.use(bodyParser.urlencoded({ extended: true }));
  router.use(bodyParser.json());
}

router.use(requireAuth);

// get all wagers
router.route('/')
  .get(
    validator.query(GetWagersSchema),
    wagerController.getUserWagersRequest,
  );

// create or get a wager for a user
router.route('/:id')
  .get(wagerController.getWagerRequest)
  .post(
    validator.body(CreateWagerSchema),
    wagerController.createWagerRequest,
  );

if (process.env.NODE_ENV === 'test') {
  router.use(handleValidationError);
}

export default router;
