import { Request, RequestHandler, Response } from 'express';
import { ValidatedRequest, ValidatedRequestSchema } from 'express-joi-validation';
import { v4 as uuidv4 } from 'uuid';

import { RequestWithJWT } from '../types/requests';
import { userService, refreshTokenService } from '../services';
import { tokenForUser } from '../helpers/utils';
import { SignUpUserRequest, UpdateOnboardingRequest } from '../validation/auth';
import { handleFailure } from './utils';
import { CURRENT_ONBOARDING_VERSION } from '../helpers/constants';

type AuthenticatedRequest<T extends ValidatedRequestSchema> = RequestWithJWT & ValidatedRequest<T>;

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
      email, password, firstName, lastName,
    } = req.body;

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
    const refreshToken = await refreshTokenService.createRefreshToken(user._id);
    
    // Generate JWT token with shorter expiration time (15 minutes)
    const jwtToken = tokenForUser(user, 15); 
    
    // Return all tokens to frontend
    return res.status(201).json({ 
      token: jwtToken, 
      refreshToken: refreshToken.token,
      csrfToken,  // Send in body for frontend to store
      user 
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

    const history = await userService.getUserBalanceHistory(userId, limit, skip);

    res.status(200).json(history);
  } catch (error) {
    handleFailure(res)(error);
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

const getOnboardingStatus: RequestHandler = (req: RequestWithJWT, res) => {
  if (!req.user?._id) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  return res.json({
    versionSeen: req.user.onboarding_version_seen ?? 0,
    currentVersion: CURRENT_ONBOARDING_VERSION,
  });
};

const updateOnboardingStatus = async (
  req: AuthenticatedRequest<UpdateOnboardingRequest>,
  res: Response
): Promise<Response | void> => {
  try {
    const userId = req.user?._id;
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const requestedVersion = req.body.version ?? CURRENT_ONBOARDING_VERSION;
    const normalizedVersion = Math.max(0, requestedVersion);

    const updatedUser = await userService.updateUser(userId, { onboarding_version_seen: normalizedVersion });

    return res.json({
      versionSeen: updatedUser.onboarding_version_seen ?? normalizedVersion,
      currentVersion: CURRENT_ONBOARDING_VERSION,
    });
  } catch (error) {
    return handleFailure(res)(error);
  }
};

const authController = {
  signUpUserRequest,
  signInUser,
  jwtSignIn,
  getBalanceHistory,
  refreshToken,
  logout,
  getOnboardingStatus,
  updateOnboardingStatus,
};

export default authController;
