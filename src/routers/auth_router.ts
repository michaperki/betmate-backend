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
import crypto from 'crypto';
import { sendVerificationEmail } from '../services/email_service';
import { refreshTokenService } from '../services';
import { tokenForUser } from '../helpers/utils';

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

// Magic-link login: exchange single-use token for JWT
router.route('/magic/:token')
  .get(sensitiveActionLimiter, async (req, res) => {
    try {
      const token = String(req.params.token || '').trim();
      if (!token) return res.status(400).json({ error: 'Invalid token' });
      const users = await userService.getUsers({ magic_login_token: token } as any);
      const match = (users || []).find((u: any) => u.magic_login_token === token);
      if (!match) return res.status(400).json({ error: 'Invalid token' });
      const now = Date.now();
      const exp = match.magic_login_expires ? new Date(match.magic_login_expires).getTime() : 0;
      if (!exp || exp < now) return res.status(400).json({ error: 'Token expired' });
      // Invalidate token (single-use) and mark verified (frictionless beta)
      const updated = await userService.updateUserData(match._id, { $unset: { magic_login_token: '', magic_login_expires: '' } as any, $set: { magic_login_used_at: new Date(), email_verified: true } as any });
      // Generate CSRF token
      const csrfToken = uuidv4();
      const refreshToken = await refreshTokenService.createRefreshToken(updated._id);
      const jwtToken = tokenForUser(updated, 15);
      return res.status(200).json({ token: jwtToken, refreshToken: refreshToken.token, csrfToken, user: updated });
    } catch (e) {
      return res.status(500).json({ error: 'Magic login failed' });
    }
  });

// Update current user's basic profile (e.g., username)
router.route('/me')
  .put(requireAuth, async (req, res) => {
    try {
      const user = req.user as UserDoc;
      const body = (req.body || {}) as any;
      const first = typeof body.first_name === 'string' ? String(body.first_name).trim() : undefined;
      if (first != null) {
        if (first.length < 1 || first.length > 80) return res.status(400).json({ error: 'Invalid first_name length' });
      }
      const update: any = {};
      if (first != null) update.first_name = first;
      if (!Object.keys(update).length) return res.status(400).json({ error: 'No valid fields' });
      const updated = await userService.updateUserData(user._id, { $set: update } as any);
      return res.status(200).json({ user: updated });
    } catch (e: any) {
      return res.status(500).json({ error: 'Update failed' });
    }
  });

router.route('/balance-history')
  .get(requireAuth, authController.getBalanceHistory);

// Email verification status
router.route('/verification-status')
  .get(requireAuth, async (req, res) => {
    try {
      const { getFeatures } = require('../utils/features_runtime');
      const ff = await getFeatures();
      const required = !!(ff as any).requireEmailVerification;
      const verified = Boolean((req.user as any)?.email_verified);
      return res.status(200).json({ verified, required });
    } catch {
      return res.status(200).json({ verified: false, required: false });
    }
  });

// Resend verification email (authenticated)
router.route('/resend-verification')
  .post(requireAuth, async (req, res) => {
    try {
      const user = req.user as UserDoc;
      if ((user as any)?.email_verified) return res.status(200).json({ sent: false });
      const token = crypto.randomBytes(24).toString('hex');
      const ttlMin = Math.max(5, Number(process.env.VERIFICATION_TOKEN_TTL_MIN || 60));
      const expires = new Date(Date.now() + ttlMin * 60 * 1000);
      await userService.updateUserData(user._id, { $set: { verification_token: token, verification_token_expires: expires } } as any);
      try {
        await sendVerificationEmail(user.email, token, (user as any)?.first_name);
      } catch {}
      return res.status(200).json({ sent: true });
    } catch (e) {
      return res.status(500).json({ sent: false });
    }
  });

// Verify email by token
router.route('/verify-email/:token')
  .get(async (req, res) => {
    try {
      const token = String(req.params.token || '').trim();
      if (!token) return res.status(400).json({ message: 'Invalid token', verified: false });
      const now = new Date();
      const users = await userService.getUsers({ verification_token: token } as any);
      const match = (users || []).find((u: any) => u.verification_token === token);
      if (!match) {
        try { const logger = require('../helpers/logger').default; logger.log({ level: 'warn', event: 'email_verify_token_not_found', context: { token_prefix: token.slice(0, 6) } }); } catch {}
        return res.status(400).json({ message: 'Invalid token', verified: false });
      }
      if (match.verification_token_expires && new Date(match.verification_token_expires).getTime() < now.getTime()) {
        try { const logger = require('../helpers/logger').default; logger.log({ level: 'info', event: 'email_verify_token_expired', context: { user_id: String(match._id) } }); } catch {}
        return res.status(400).json({ message: 'Token expired', verified: false });
      }
      const updated = await userService.updateUserData(match._id, { $set: { email_verified: true }, $unset: { verification_token: '', verification_token_expires: '' } } as any);
      try { const logger = require('../helpers/logger').default; logger.log({ level: 'info', event: 'email_verified', context: { user_id: String(match._id), email: match.email } }); } catch {}
      return res.status(200).json({ message: 'Email verified', verified: true, user: updated });
    } catch (e) {
      return res.status(500).json({ message: 'Verification failed', verified: false });
    }
  });

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

// Terms acceptance endpoints (simple versioned acceptance)
router.route('/terms')
  .get(requireAuth, async (req, res) => {
    try {
      const user = req.user as UserDoc;
      const accepted = Number((user as any)?.terms_version_accepted || 0);
      const currentVersion = 1;
      return res.status(200).json({ accepted, currentVersion });
    } catch (e) {
      return res.status(200).json({ accepted: 0, currentVersion: 1 });
    }
  })
  .put(requireAuth, async (req, res) => {
    try {
      const user = req.user as UserDoc;
      const v = Number((req.body && (req.body as any).version) || 0);
      const versionAccepted = Number.isFinite(v) ? v : 0;
      const updated = await userService.updateUserData(user._id, { $set: { terms_version_accepted: versionAccepted } as any });
      return res.status(200).json({ accepted: Number((updated as any)?.terms_version_accepted || versionAccepted), currentVersion: 1 });
    } catch (e) {
      return res.status(400).json({ message: 'Invalid terms payload' });
    }
  });

// Always handle validation errors from express-joi-validation
router.use(handleValidationError);

export default router;
