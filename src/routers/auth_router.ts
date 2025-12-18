/* eslint-disable consistent-return */
import bodyParser from 'body-parser';
import express from 'express';
import { createValidator } from 'express-joi-validation';
import { v4 as uuidv4 } from 'uuid';

import { requireSignin, requireAuth } from '../authentication';
import { authLimiter, sensitiveActionLimiter } from '../middleware/rate_limiter';

import { authController } from '../controllers';
import { SignUpUserSchema } from '../validation/auth';
import { handleValidationError } from '../validation';

const router = express();
const validator = createValidator({ passError: true });

// TODO: Move middleware attachment to test file
if (process.env.NODE_ENV === 'test') {
  // enable json message body for posting data to router
  router.use(bodyParser.urlencoded({ extended: true }));
  router.use(bodyParser.json());
}

// CSRF token generation endpoint - simplified version without cookies for now
router.route('/csrf-token')
  .get((req, res) => {
    // Generate a random token
    const csrfToken = uuidv4();
    
    // For now, just return in body for frontend to use
    // Cookie functionality will be added when cookie-parser is working
    res.json({ csrfToken });
  });

router.route('/signup')
  .post(
    authLimiter, // Rate limit signup attempts
    validator.body(SignUpUserSchema),
    authController.signUpUserRequest
  );

// Send user object and server will send back authToken and user object
router.route('/signin')
  .post(
    authLimiter, // Rate limit signin attempts
    requireSignin,
    authController.signInUser
  );

router.route('/jwt-signin')
  .get(requireAuth, authController.jwtSignIn);

router.route('/refresh-token')
  .post(authLimiter, authController.refreshToken);

router.route('/logout')
  .post(requireAuth, authController.logout);

router.route('/balance-history')
  .get(requireAuth, authController.getBalanceHistory);

// Mock KYC flow start (non-production only advisable)
router.route('/kyc/start')
  .post(requireAuth, authController.startKycMock);

// Minimal onboarding status endpoint to quiet frontend polling
router.route('/onboarding')
  .get(requireAuth, (req, res) => {
    res.status(200).json({ needsOnboarding: false, version: 1 });
  });

if (process.env.NODE_ENV === 'test') {
  router.use(handleValidationError);
}

export default router;
