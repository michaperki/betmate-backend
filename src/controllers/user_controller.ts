import { RequestHandler } from 'express';
import {
  documentNotFoundError, getSuccessfulDeletionMessage,
} from 'helpers/constants';
import { userService } from 'services';

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

const getUser: RequestHandler = async (req, res) => {
  try {
    const user = await userService.getUser(req.params.id);
    return user
      ? res.status(200).json(user)
      : res.status(404).json({ message: documentNotFoundError });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

const updateUser: RequestHandler = async (req, res) => {
  try {
    // this makes sure the user isn't updating something illegal like their balance
    const allowedChanges = ['first_name', 'last_name', 'email', 'password'];
    const whitelistedBody = Object.keys(req.body).reduce((currBody, key) => {
      if (allowedChanges.includes(key)) return { ...currBody, [key]: req.body[key] };
      return currBody;
    }, {});

    const updatedUser = await userService.updateUserData(req.params.id, whitelistedBody);
    return updatedUser
      ? res.status(200).json(updatedUser)
      : res.status(404).json({ message: documentNotFoundError });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

const deleteUser: RequestHandler = async (req, res) => {
  try {
    const deleteResult = await userService.deleteUser(req.params.id);
    return deleteResult
      ? res.json({ message: getSuccessfulDeletionMessage(req.params.id) })
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
