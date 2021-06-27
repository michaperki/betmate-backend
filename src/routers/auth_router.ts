/* eslint-disable consistent-return */
import bodyParser from 'body-parser';
import express from 'express';
import { createValidator } from 'express-joi-validation';

import { requireSignin, requireAuth } from 'authentication';

import { authController } from 'controllers';
// import { userFieldsValid } from 'helpers/validation/auth';
// import { validateRequest } from 'helpers/validation';
import { SignUpUserSchema } from 'validation/auth';
import { checkErrors } from 'validation';

const router = express();
const validator = createValidator({ passError: true });

// TODO: Move middleware attachment to test file
if (process.env.NODE_ENV === 'test') {
  // enable json message body for posting data to router
  router.use(bodyParser.urlencoded({ extended: true }));
  router.use(bodyParser.json());
}

router.route('/signup')
  .post(validator.body(SignUpUserSchema), checkErrors, authController.signUpUserRequest);

// Send user object and server will send back authToken and user object
router.route('/signin')
  .post(requireSignin, authController.signInUser);

router.route('/jwt-signin')
  .get(requireAuth, authController.jwtSignIn);

export default router;
