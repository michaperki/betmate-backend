/* eslint-disable consistent-return */
import bodyParser from 'body-parser';
import express from 'express';

import { requireSignin } from 'authentication';

import { authController } from 'controllers';

const router = express();

// TODO: Move middleware attachment to test file
if (process.env.NODE_ENV === 'test') {
  // enable json message body for posting data to router
  router.use(bodyParser.urlencoded({ extended: true }));
  router.use(bodyParser.json());
}

router.route('/signup')
  .post(authController.signUpUser);

// Send user object and server will send back authToken and user object
router.route('/signin')
  .post(requireSignin, authController.signInUser);

export default router;
