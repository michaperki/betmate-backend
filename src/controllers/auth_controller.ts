import { Request, RequestHandler, Response } from 'express';
import { ValidatedRequest } from 'express-joi-validation';
import { v4 as uuidv4 } from 'uuid';

import { RequestWithJWT } from '../types/requests';
import { userService, refreshTokenService } from '../services';
import { tokenForUser } from '../helpers/utils';
import crypto from 'crypto';
import { sendVerificationEmail } from '../services/email_service';
import { SignUpUserRequest } from '../validation/auth';
import { handleFailure } from './utils';
import { InviteCode } from '../models';

/**
 * Sign up user from request
 * - Create `User` document in database
 * - Create JWT token and refresh token
 * - Return both to caller with CSRF protection
 *
 * Request must be prefixed with appropriate validation middleware
 * - `validator.body(SignUpUserSchema)`
 * - `validateRequest`
 */
const signUpUserRequest: RequestHandler = async (req: ValidatedRequest<SignUpUserRequest>, res) => {
  try {
    const {
      email, password, firstName, lastName, invite_code, device_id,
    } = req.body;

    // Enforce invite gating only when explicitly enabled via env.
    // Previously this defaulted to true in production which blocked normal onboarding.
    // Now gating is controlled solely by INVITE_GATING_ENABLED to allow normal signup flows in staging/prod.
    const gatingEnabled = (process.env.INVITE_GATING_ENABLED || '').toLowerCase() === 'true';
    const rawCode = String(invite_code || '').trim();

    let invite: any = null;
    if (rawCode) {
      // Lookup invite if supplied
      invite = await InviteCode.findOne({ code: rawCode, active: true }).lean();
      if (!invite && gatingEnabled) {
        return res.status(403).json({ message: 'Invalid invite code', code: 'INVITE_INVALID' });
      }
      if (invite && invite.expires_at && new Date(invite.expires_at).getTime() < Date.now()) {
        if (gatingEnabled) return res.status(403).json({ message: 'Invite expired', code: 'INVITE_EXPIRED' });
        invite = null; // ignore expired in non-gated mode
      }
      if (invite && (invite.redeemed_count || 0) >= (invite.max_redemptions || 0)) {
        if (gatingEnabled) return res.status(403).json({ message: 'Invite fully redeemed', code: 'INVITE_EXHAUSTED' });
        invite = null; // ignore exhausted in non-gated mode
      }
    } else if (gatingEnabled) {
      // No code provided and gating required
      return res.status(403).json({ message: 'Invite code required', code: 'INVITE_REQUIRED' });
    }

    const isEmailAvailable = await userService.emailAvailable(email);
    if (!isEmailAvailable) {
      res.status(409).json({ message: 'Request error', errors: ['Email address already associated to a user'] });
      return;
    }

    // Save the user
    const user = await userService.createUser({
      email,
      password,
      first_name: firstName,
      last_name: lastName
    });

    // Attach basic signup context
    try {
      const ip = (req.ip || '').toString();
      const ua = (req.headers['user-agent'] || '').toString();
      const dev = (device_id || req.header('X-Device-Id') || req.header('x-device-id') || '').toString();
      await userService.updateUserData(user._id, { $set: { signup_ip: ip || undefined, signup_user_agent: ua || undefined, signup_device_id: dev || undefined } } as any);
    } catch {}

    // Atomically redeem invite (increment count only if under cap)
    if (invite) {
      try {
        const upd = await InviteCode.findOneAndUpdate(
          {
            _id: (invite as any)._id,
            active: true,
            redeemed_count: { $lt: Number((invite as any).max_redemptions || 0) },
            ...(invite.expires_at ? { expires_at: { $gt: new Date() } } : {}),
          },
          { $inc: { redeemed_count: 1 } },
          { new: true }
        );
        if (!upd) {
          if (gatingEnabled) return res.status(403).json({ message: 'Invite unavailable', code: 'INVITE_RACE' });
        } else {
          // Automatic dual-currency grants
          const grantTokens = Number(upd.grant_tokens || process.env.SIGNUP_GRANT_BET || 0);
          const grantCash = Number(upd.grant_cash_usd || process.env.SIGNUP_GRANT_USD || 0);
          const inc: any = {};
          if (grantTokens > 0) {
            inc.token_balance = (inc.token_balance || 0) + grantTokens;
          }
          if (grantCash > 0) {
            inc.cash_balance = (inc.cash_balance || 0) + grantCash;
          }
          if (Object.keys(inc).length) {
            await userService.updateUserData(user._id, { $inc: inc } as any);
          }
          // Ledger entries
          if (grantTokens > 0) await userService.recordBalanceChange(user._id, grantTokens, 'Signup bonus', (upd as any)._id, 'Invite', 'BET');
          if (grantCash > 0) await userService.recordBalanceChange(user._id, grantCash, 'Signup bonus', (upd as any)._id, 'Invite', 'USDT');
        }
      } catch (e) {
        // soft-fail on bonus if invite could not be redeemed
      }
    }
    
    // Generate CSRF token
    const csrfToken = uuidv4();
    
    // Cookie functionality temporarily disabled until cookie-parser is working
    /*
    // Set CSRF token as HTTP-only cookie
    res.cookie('csrf-token', csrfToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 24 * 60 * 60 * 1000 // 1 day
    });
    */
    
    // Generate email verification token if feature enabled
    try {
      const { getFeatures: getRuntimeFeatures } = require('../utils/features_runtime');
      const ff = await getRuntimeFeatures();
      if ((ff as any)?.requireEmailVerification === true) {
        const token = crypto.randomBytes(24).toString('hex');
        const ttlMin = Math.max(5, Number(process.env.VERIFICATION_TOKEN_TTL_MIN || 60));
        const expires = new Date(Date.now() + ttlMin * 60 * 1000);
        await userService.updateUserData((user as any)._id, { $set: { verification_token: token, verification_token_expires: expires, email_verified: false } } as any);
        try { await sendVerificationEmail(user.email, token, (user as any)?.first_name); } catch {}
      }
    } catch {}

    // Refresh the user snapshot
    const refUser = await userService.getUser(user._id);
    // Generate refresh token
    const refreshToken = await refreshTokenService.createRefreshToken(user._id);
    
    // Generate JWT token with shorter expiration time (15 minutes)
    const jwtToken = tokenForUser(refUser || user, 15); 
    
    // Return all tokens to frontend
    return res.status(201).json({ 
      token: jwtToken, 
      refreshToken: refreshToken.token,
      csrfToken,  // Send in body for frontend to store
      user: (refUser || user)
    });
  } catch (error) {
    if (!res.headersSent) {
      return handleFailure(res)(error);
    }
  }
};

/**
 * Sign in user from request
 * - Authenticate user via `requireSignIn` middleware
 * - Get `User` document via `requireSignIn` middleware
 * - Create JWT token and refresh token
 * - Return both to caller with CSRF protection
 *
 * Request must be prefixed with appropriate validation middleware
 * - `requireSignIn`
 */
const signInUser: RequestHandler = async (req: RequestWithJWT, res) => {
  try {
    // Generate CSRF token
    const csrfToken = uuidv4();
    
    // Cookie functionality temporarily disabled until cookie-parser is working
    /*
    // Set CSRF token as HTTP-only cookie
    res.cookie('csrf-token', csrfToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 24 * 60 * 60 * 1000 // 1 day
    });
    */
    
    // Generate refresh token
    const refreshToken = await refreshTokenService.createRefreshToken(req.user._id);
    
    // Generate JWT token with shorter expiration time (15 minutes)
    const jwtToken = tokenForUser(req.user, 15);
    
    // Return all tokens to frontend
    return res.json({
      token: jwtToken,
      refreshToken: refreshToken.token,
      csrfToken,  // Send in body for frontend to store
      user: req.user
    });
  } catch (error) {
    return handleFailure(res)(error);
  }
};

/**
 * Get user info from request
 * - Authenticate user via `requireAuth` middleware
 * - Get `User` document via `requireAuth` middleware
 * - Return both to caller
 *
 * Request must be prefixed with appropriate validation middleware
 * - `requireAuth`
 */
const jwtSignIn: RequestHandler = (req: RequestWithJWT, res) => (
  res.json({ user: req.user })
);

/**
 * Get user's balance history
 * - Authenticate user via `requireAuth` middleware
 * - Return balance history for authenticated user
 *
 * Request must be prefixed with appropriate validation middleware
 * - `requireAuth`
 */
const getBalanceHistory = async (req: RequestWithJWT, res: Response): Promise<void> => {
  try {
    const userId = req.user?._id;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 30;
    const skip = req.query.skip ? parseInt(req.query.skip as string, 10) : 0;
    const currency = (req.query.currency as any) as ('BET' | 'USDT' | undefined);

    const history = await userService.getUserBalanceHistory(userId, limit, skip, currency);

    res.status(200).json(history);
  } catch (error) {
    handleFailure(res)(error);
  }
};

/**
 * Mock KYC start: set user's kyc_status to 'pending'.
 */
const startKycMock: RequestHandler = async (req: RequestWithJWT, res) => {
  try {
    const userId = req.user?._id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const current = (req.user as any)?.kyc_status || 'none';
    if (current === 'approved') {
      return res.status(200).json({ ok: true, kyc_status: 'approved' });
    }
    const updated = await userService.updateUserData(userId, { $set: { kyc_status: 'pending', kyc_updated_at: new Date() } } as any);
    return res.status(200).json({ ok: true, kyc_status: (updated as any)?.kyc_status || 'pending' });
  } catch (error) {
    return handleFailure(res)(error);
  }
};

/**
 * Refresh auth token using refresh token
 * - Validate refresh token
 * - Create new JWT token
 * - Create new refresh token
 * - Return both to caller
 */
const refreshToken: RequestHandler = async (req, res) => {
  try {
    const { refreshToken: token } = req.body;
    
    if (!token) {
      return res.status(400).json({ 
        message: 'Refresh token is required',
        code: 'REFRESH_TOKEN_REQUIRED' 
      });
    }
    
    // Validate the refresh token
    const oldRefreshToken = await refreshTokenService.getRefreshTokenByToken(token);
    
    // Get the user
    const user = await userService.getUser(oldRefreshToken.userId);
    if (!user) {
      return res.status(401).json({ 
        message: 'User not found',
        code: 'USER_NOT_FOUND'
      });
    }
    
    // Rotate the refresh token (invalidate the old one, create a new one)
    const newRefreshToken = await refreshTokenService.rotateRefreshToken(token);
    
    // Generate a new access token
    const accessToken = tokenForUser(user);
    
    // Return both tokens
    return res.json({ 
      token: accessToken, 
      refreshToken: newRefreshToken.token,
      user
    });
  } catch (error) {
    return handleFailure(res)(error);
  }
};

/**
 * Logout user by invalidating refresh token
 * - Delete refresh token from database
 * - Clear HTTP cookies
 * - Return success message
 */
const logout: RequestHandler = async (req: RequestWithJWT, res) => {
  try {
    const { refreshToken: token } = req.body;
    
    if (token) {
      // Delete the refresh token
      await refreshTokenService.deleteRefreshToken(token);
    }
    
    // Clear cookies functionality temporarily disabled
    // res.clearCookie('csrf-token');
    
    return res.status(200).json({ message: 'Logged out successfully' });
  } catch (error) {
    return handleFailure(res)(error);
  }
};

const authController = {
  signUpUserRequest,
  signInUser,
  jwtSignIn,
  getBalanceHistory,
  startKycMock,
  refreshToken,
  logout,
};

export default authController;
