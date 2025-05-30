import { Request, RequestHandler, Response } from 'express';
import { ValidatedRequest } from 'express-joi-validation';

import { RequestWithJWT } from '../types/requests';
import { userService } from '../services';
import { tokenForUser } from '../helpers/utils';
import { SignUpUserRequest } from '../validation/auth';
import { handleFailure } from './utils';

/**
 * Sign up user from request
 * - Create `User` document in database
 * - Create JWT token
 * - Return both to caller
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

    // Save the user then transmit to frontend
    const user = await userService.createUser({
      email,
      password,
      first_name: firstName,
      last_name: lastName
    });
    return res.status(201).json({ token: tokenForUser(user), user });
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
 * - Create JWT token
 * - Return both to caller
 *
 * Request must be prefixed with appropriate validation middleware
 * - `requireSignIn`
 */
const signInUser: RequestHandler = (req: RequestWithJWT, res) => (
  res.json({ token: tokenForUser(req.user), user: req.user })
);

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

const authController = {
  signUpUserRequest,
  signInUser,
  jwtSignIn,
  getBalanceHistory,
};

export default authController;
