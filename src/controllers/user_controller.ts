import { RequestHandler } from 'express';
import {
  documentNotFoundError, getSuccessfulDeletionMessage,
} from 'helpers/constants';
import { userService } from 'services';
import { RequestWithJWT } from 'types/requests';
import { handleFailure, handleSuccess } from './utils';

/**
 * Get all users from request.
 *
 * No filter criteria.
 *
 * Need to add information protection as it makes all user info public
 *
 * Request must be prefixed with appropriate validation middleware
 * - `requireAuth`
 */
const getAllUsers: RequestHandler = async (req, res) => (
  userService
    .getUsers({})
    .then(handleSuccess(res))
    .catch(handleFailure(res))
);

/**
 * Get user from request.
 *
 * Uses `requireAuth` to get userID
 *
 * Request must be prefixed with appropriate validation middleware
 * - `requireAuth`
 */
const getUser: RequestHandler = async (req: RequestWithJWT, res) => (
  userService
    .getUser(req.user._id)
    .then(handleSuccess(res))
    .catch(handleFailure(res))
);

/**
 * Update user from request.
 *
 * Uses `requireAuth` to get userID
 *
 * Request must be prefixed with appropriate validation middleware
 * - `requireAuth`
 */
const updateUser: RequestHandler = async (req: RequestWithJWT, res) => {
  // this makes sure the user isn't updating something illegal like their balance
  const allowedChanges = ['first_name', 'last_name', 'email', 'password'];
  const whitelistedBody = Object.keys(req.body).reduce((currBody, key) => (
    allowedChanges.includes(key)
      ? { ...currBody, [key]: req.body[key] }
      : currBody
  ), {});

  try {
    const updatedUser = await userService.updateUserData(req.user._id, whitelistedBody);
    return handleSuccess(res)(updatedUser);
  } catch (error) {
    return handleFailure(res)(error);
  }
};

/**
 * Update user from request.
 *
 * Uses `requireAuth` to get userID
 *
 * Request must be prefixed with appropriate validation middleware
 * - `requireAuth`
 */
const deleteUser: RequestHandler = async (req: RequestWithJWT, res) => {
  try {
    const deleteResult = await userService.deleteUser(req.user._id);
    return deleteResult
      ? res.json({ message: getSuccessfulDeletionMessage(req.user._id) })
      : res.status(404).json({ message: documentNotFoundError });
  } catch (error) {
    return handleFailure(res)(error);
  }
};

const userController = {
  getAllUsers,
  getUser,
  updateUser,
  deleteUser,
};

export default userController;
