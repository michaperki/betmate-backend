import jwt from 'jwt-simple';
import env from 'env-var';
import { RequestHandler } from 'express';
import { UserDoc } from 'types/models';
import { Users } from 'models';
import {
  documentNotFoundError, getFieldNotFoundError, getSuccessfulDeletionMessage,
} from 'helpers/constants';
import { Types, UpdateQuery } from 'mongoose';

const tokenForUser = (user: UserDoc): string => {
  const timestamp = new Date().getTime();
  return jwt.encode({ sub: user.id, iat: timestamp }, env.get('AUTH_SECRET').required().asString());
};

const updateUserData = (id: string | Types.ObjectId, fields: UpdateQuery<UserDoc>): Promise<UserDoc | null> => (
  Users
    .findByIdAndUpdate(id, fields, { new: true, runValidators: true })
    .then((doc) => doc)
    .catch(() => null)
);

const getAllUsers: RequestHandler = async (req, res) => {
  try {
    const users = await Users.find({});
    const cleanedUsers = await Promise.all(users.map((user) => new Promise((resolve) => {
      const userJSON = user.toJSON();
      delete userJSON.password;
      resolve(user);
    })));
    return res.status(200).json(cleanedUsers);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

const createNewUser: RequestHandler = async (req, res) => {
  try {
    const user = new Users();

    const {
      email, password, first_name: firstName, last_name: lastName,
    } = req.body;

    if (!email) return res.status(400).json({ message: getFieldNotFoundError('email') });
    if (!password) return res.status(400).json({ message: getFieldNotFoundError('password') });

    user.email = email;
    user.password = password;
    user.first_name = firstName || '';
    user.last_name = lastName || '';

    const savedUser = await user.save();
    const json = savedUser.toJSON();
    delete json.password;
    return res.status(201).json(json);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

const getUser: RequestHandler = async (req, res) => {
  try {
    const user = await Users.findById(req.params.id);
    const json = user?.toJSON();
    delete json.password;
    return res.status(200).json(json);
  } catch (error) {
    if (error.kind === 'ObjectId') {
      return res.status(404).json({ message: documentNotFoundError });
    }
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

    const updatedUser = await Users.findOneAndUpdate({ _id: req.params.id }, whitelistedBody, { new: true });
    const json = updatedUser?.toJSON();

    delete json.password;
    return res.status(200).json(json);
  } catch (error) {
    if (error.kind === 'ObjectId') {
      return res.status(404).json({ message: documentNotFoundError });
    }
    return res.status(500).json({ message: error.message });
  }
};

const deleteUser: RequestHandler = async (req, res) => {
  try {
    await Users.findOneAndDelete({ _id: req.params.id });
    return res.json({ message: getSuccessfulDeletionMessage(req.params.id) });
  } catch (error) {
    if (error.kind === 'ObjectId') {
      return res.status(404).json({ message: documentNotFoundError });
    }
    return res.status(500).json({ message: error.message });
  }
};

const userController = {
  tokenForUser,
  updateUserData,
  getAllUsers,
  createNewUser,
  getUser,
  updateUser,
  deleteUser,
};

export default userController;
