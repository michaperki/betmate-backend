import { RequestHandler } from 'express';
import {
  documentNotFoundError, getSuccessfulDeletionMessage,
} from 'helpers/constants';
import { userService } from 'services';
import { RequestWithJWT } from 'types/requests';

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
const getAllUsers: RequestHandler = async (req, res) => {
  try {
    const users = await userService.getUsers({});

    return users
      ? res.status(200).json(users)
      : res.status(500).json({ message: 'Error getting users' });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

/**
 * Get user from request.
 *
 * Uses `requireAuth` to get userID
 *
 * Request must be prefixed with appropriate validation middleware
 * - `requireAuth`
 */
const getUser: RequestHandler = async (req: RequestWithJWT, res) => {
  try {
    console.log(req.user._id);
    const user = await userService.getUser(req.user._id);
    return user
      ? res.status(200).json(user)
      : res.status(404).json({ message: documentNotFoundError });
  } catch (error) {
    return res.status(500).json({ message: error.message });
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
const updateUser: RequestHandler = async (req: RequestWithJWT, res) => {
  try {
    // this makes sure the user isn't updating something illegal like their balance
    const allowedChanges = ['first_name', 'last_name', 'email', 'password'];
    const whitelistedBody = Object.keys(req.body).reduce((currBody, key) => (
      allowedChanges.includes(key)
        ? { ...currBody, [key]: req.body[key] }
        : currBody
    ), {});

    const updatedUser = await userService.updateUserData(req.user._id, whitelistedBody);
    return updatedUser
      ? res.status(200).json(updatedUser)
      : res.status(404).json({ message: documentNotFoundError });
  } catch (error) {
    return res.status(500).json({ message: error.message });
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
    return res.status(500).json({ message: error.message });
  }
};

const userController = {
  getAllUsers,
  getUser,
  updateUser,
  deleteUser,
};

export default userController;
