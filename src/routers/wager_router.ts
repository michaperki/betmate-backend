import bodyParser from 'body-parser';
import express from 'express';

import { requireAuth } from 'authentication';
import { wagerController } from 'controllers';
import { createWagerFieldsValid } from 'helpers/validation';

const router = express();

// TODO: Move middleware attachment to test file
if (process.env.NODE_ENV === 'test') {
  // enable json message body for posting data to router
  router.use(bodyParser.urlencoded({ extended: true }));
  router.use(bodyParser.json());
}

router.use(requireAuth);

// get all wagers
router.route('/')
  .get(wagerController.getUserWagersRequest);

// create or get a wager for a user
router.route('/:id')
  .get(wagerController.getWagerRequest)
  .post(...createWagerFieldsValid, wagerController.createWagerRequest);

export default router;
