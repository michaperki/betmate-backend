import bodyParser from 'body-parser';
import express from 'express';

import { requireAuth } from '../authentication';
import { wagerController } from '../controllers';

const router = express();

// TODO: Move middleware attachment to test file
if (process.env.NODE_ENV === 'test') {
  // enable json message body for posting data to router
  router.use(bodyParser.urlencoded({ extended: true }));
  router.use(bodyParser.json());
}

router.use(requireAuth);

// find and return all users
router.route('/:id')
  .post(wagerController.createWager);

// router.route('/:id')
//   .get()
//   .put()
//   .delete();

export default router;
