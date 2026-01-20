/* eslint-disable consistent-return */
import bodyParser from 'body-parser';
import express from 'express';
import { createValidator } from 'express-joi-validation';
import { v4 as uuidv4 } from 'uuid';

import { requireSignin, requireAuth } from '../authentication';
import { authLimiter, sensitiveActionLimiter } from '../middleware/rate_limiter';

import { authController } from '../controllers';
import { UserDoc } from '../types/models/user';
import userService from '../services/user_service';
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

// Onboarding status endpoints (stubbed persistence)
// GET returns the current onboarding version info
// PUT accepts `{ version: number }` and echoes back as seen (no DB persistence yet)
router.route('/onboarding')
  .get(requireAuth, async (req, res) => {
    try {
      const user = req.user as UserDoc;
      const versionSeen = Number(user?.onboarding_version_seen || 0);
      // For now, a single current version; may move to runtime features later
      const currentVersion = 1;
      return res.status(200).json({ versionSeen, currentVersion });
    } catch (e) {
      return res.status(200).json({ versionSeen: 0, currentVersion: 1 });
    }
  })
  .put(requireAuth, async (req, res) => {
    try {
      const user = req.user as UserDoc;
      const v = Number((req.body && (req.body as any).version) || 0);
      const versionSeen = Number.isFinite(v) ? v : 0;
      const updated = await userService.updateUserData(user._id, { $set: { onboarding_version_seen: versionSeen } as any });
      return res.status(200).json({ versionSeen: Number(updated?.onboarding_version_seen || versionSeen), currentVersion: 1 });
    } catch (e) {
      return res.status(400).json({ message: 'Invalid onboarding payload' });
    }
  });

if (process.env.NODE_ENV === 'test') {
  router.use(handleValidationError);
}

export default router;
