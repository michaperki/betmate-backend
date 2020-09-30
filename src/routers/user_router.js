import bodyParser from 'body-parser';
import express from 'express';

import { Users } from '../models';

import { requireAuth } from '../authentication';
import { documentNotFoundError, getFieldNotFoundError, getSuccessfulDeletionMessage } from '../helpers/constants';

const router = express();

// TODO: Move middleware attachment to test file
if (process.env.NODE_ENV === 'test') {
  // enable json message body for posting data to router
  router.use(bodyParser.urlencoded({ extended: true }));
  router.use(bodyParser.json());
}

router.use(requireAuth);

// find and return all users
router.route('/')
  .get(async (req, res) => {
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
  })

  // Create new user
  .post(async (req, res) => {
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
  });

// // ! TESTING ONLY
// .delete(requireAuth, async (req, res) => {
//   try {
//     await Users.deleteMany({ });
//     return res.status(200).json({ message: 'Successfully deleted all users.' });
//   } catch (error) {
//     return res.status(500).json({ message: error.message });
//   }
// });

router.route('/:id')
  .get(async (req, res) => {
    try {
      const user = await Users.findById(req.params.id);
      const json = user.toJSON();
      delete json.password;
      return res.status(200).json(json);
    } catch (error) {
      if (error.kind === 'ObjectId') {
        return res.status(404).json({ message: documentNotFoundError });
      } else {
        return res.status(500).json({ message: error.message });
      }
    }
  })

  .put(async (req, res) => {
    try {
      const updatedUser = await Users.findOneAndUpdate({ _id: req.params.id }, req.body, { useFindAndModify: false, new: true });
      const json = updatedUser.toJSON();
      delete json.password;
      return res.status(200).json(json);
    } catch (error) {
      if (error.kind === 'ObjectId') {
        return res.status(404).json({ message: documentNotFoundError });
      } else {
        return res.status(500).json({ message: error.message });
      }
    }
  })

  .delete(async (req, res) => {
    try {
      await Users.findOneAndDelete({ _id: req.params.id }, { useFindAndModify: false });
      return res.json({ message: getSuccessfulDeletionMessage(req.params.id) });
    } catch (error) {
      if (error.kind === 'ObjectId') {
        return res.status(404).json({ message: documentNotFoundError });
      } else {
        return res.status(500).json({ message: error.message });
      }
    }
  });

export default router;
