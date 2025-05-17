import { RequestHandler } from 'express';
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
    if (!isEmailAvailable) return res.status(409).json({ message: 'Request error', errors: ['Email address already associated to a user'] });

    // Save the user then transmit to frontend
    const user = await userService.createUser(email, password, firstName, lastName);
    return res.status(201).json({ token: tokenForUser(user), user });
  } catch (error) {
    return handleFailure(res)(error);
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

const authController = {
  signUpUserRequest,
  signInUser,
  jwtSignIn,
};

export default authController;
