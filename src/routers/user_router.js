import bodyParser from 'body-parser';
import express from 'express';

import { Users } from '../models';

import { requireAuth } from '../authentication';
import { documentNotFoundError, getFieldNotFoundError } from '../helpers/constants';

const router = express();

// TODO: ADD IN TESTING
// enable json message body for posting data to router
router.use(bodyParser.urlencoded({ extended: true }));
router.use(bodyParser.json());

router.use(requireAuth);

// find and return all users
router.route('/')

  // Get all users
  .get((req, res) => {
    Users.find({}).then((users) => {
      Promise.all(users.map((user) => {
        return new Promise((resolve) => {
          user = user.toObject();
          delete user.password;
          resolve(user);
        });
      })).then((cleanedUsers) => {
        return res.json(cleanedUsers);
      });
    }).catch((error) => {
      return res.status(500).json({ message: error.message });
    });
  })

  // Create new user
  .post((req, res) => {
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

    user.save()
      .then((savedUser) => {
        savedUser = savedUser.toObject();
        delete savedUser.password;
        return res.status(201).json(savedUser);
      }).catch((error) => {
        return res.status(500).json({ message: error.message });
      });
  });

// // Delete all resources (SECURE, TESTING ONLY)
// .delete(requireAuth, (req, res) => {
//   Users.deleteMany({ })
//     .then(() => {
//       return res.json({ message: 'Successfully deleted all users.' });
//     })
//     .catch((error) => {
//       return res.status(500).json({ message: error.message });
//     });
// });

router.route('/:id')

  // Get user by ID
  .get((req, res) => {
    Users.findById(req.params.id)
      .then((user) => {
        user = user.toObject();
        delete user.password;
        return res.json(user);
      })
      .catch((error) => {
        if (error.kind === 'ObjectId') {
          return res.status(404).json({ message: documentNotFoundError });
        } else {
          return res.status(500).json({ message: error.message });
        }
      });
  })

  // Update user by ID
  .put((req, res) => {
    Users.updateOne({ _id: req.params.id }, req.body)
      .then(() => {
        // Fetch user object and send
        Users.findById(req.params.id)
          .then((updatedUser) => {
            updatedUser = updatedUser.toObject();
            delete updatedUser.password;
            return res.json(updatedUser);
          });
      })
      .catch((error) => {
        if (error.kind === 'ObjectId') {
          return res.status(404).json({ message: documentNotFoundError });
        } else {
          return res.status(500).json({ message: error.message });
        }
      });
  })

  // Delete user by ID
  .delete((req, res) => {
    Users.deleteOne({ _id: req.params.id })
      .then((result) => {
        if (result.deletedCount === 1) { // Successful deletion
          return res.json({ message: `User with id: ${req.params.id} was successfully deleted` });
        } else {
          return res.status(500).json({ message: 'Resource not able to be deleted' });
        }
      })
      .catch((error) => {
        if (error.kind === 'ObjectId') {
          return res.status(404).json({ message: documentNotFoundError });
        } else {
          return res.status(500).json({ message: error.message });
        }
      });
  });

export default router;
