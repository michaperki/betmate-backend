import jwt from 'jwt-simple';
import env from 'env-var';
import { IUser } from '../types/models';
import { RequestHandler } from 'express';
import { Users } from '../models';
import {
  documentNotFoundError, getFieldNotFoundError, getSuccessfulDeletionMessage
} from '../helpers/constants';

function tokenForUser(user: IUser) {
  const timestamp = new Date().getTime();
  return jwt.encode({ sub: user.id, iat: timestamp }, env.get('AUTH_SECRET').required().asString());
}

const getAllUsers: RequestHandler = async (req, res) => {
  try {
    const users = await Users.find({});
    const cleanedUsers = await Promise.all(users.map((user) => {
      return new Promise((resolve) => {
        user = user.toJSON();
        delete user.password;
        resolve(user);
      });
    }));
    return res.status(200).json(cleanedUsers);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

const createNewUser: RequestHandler = async (req, res) => {
  try {
    const user = new Users();

    const {
      email, password, first_name, last_name,
    } = req.body;

    if (!email) return res.status(400).json({ message: getFieldNotFoundError('email') });
    if (!password) return res.status(400).json({ message: getFieldNotFoundError('password') });

    user.email = email;
    user.password = password;
    user.first_name = first_name || '';
    user.last_name = last_name || '';

    const savedUser = await user.save();
    const json = savedUser.toJSON();
    delete json.password;
    return res.status(201).json(json);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

const getUser: RequestHandler = async (req, res) => {
  try {
    const user = await Users.findById(req.params.id);
    const json = user?.toJSON();
    delete json.password;
    return res.status(200).json(json);
  } catch (error) {
    if (error.kind === 'ObjectId') {
      return res.status(404).json({ message: documentNotFoundError });
    } else {
      return res.status(500).json({ message: error.message });
    }
  }
}

const updateUser: RequestHandler = async (req, res) => {
  try {
    const updatedUser = await Users.findOneAndUpdate({ _id: req.params.id }, req.body, { new: true });
    const json = updatedUser?.toJSON();
    delete json.password;
    return res.status(200).json(json);
  } catch (error) {
    if (error.kind === 'ObjectId') {
      return res.status(404).json({ message: documentNotFoundError });
    } else {
      return res.status(500).json({ message: error.message });
    }
  }
}

const deleteUser: RequestHandler = async (req, res) => {
  try {
    await Users.findOneAndDelete({ _id: req.params.id });
    return res.json({ message: getSuccessfulDeletionMessage(req.params.id) });
  } catch (error) {
    if (error.kind === 'ObjectId') {
      return res.status(404).json({ message: documentNotFoundError });
    } else {
      return res.status(500).json({ message: error.message });
    }
  }
}

const userController = {
  tokenForUser,
  getAllUsers,
  createNewUser,
  getUser,
  updateUser,
  deleteUser
};

export default userController;
