import express from 'express';

import { Users } from '../models';

const router = express();

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
      return res.status(500).json(error);
    });
  })

  // Create new user
  .post((req, res) => {
    const user = new Users();

    user.first_name = req.body.first_name;
    user.last_name = req.body.last_name;
    user.email = req.body.email;
    user.password = req.body.password;

    user.save()
      .then((savedUser) => {
        savedUser = savedUser.toObject();
        delete savedUser.password;
        return res.json(savedUser);
      }).catch((error) => {
        return res.status(500).json(error);
      });
  });

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
          return res.status(404).json(error.message);
        } else {
          return res.status(500).json(error.message);
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
          return res.status(404).json(error.message);
        } else {
          return res.status(500).json(error);
        }
      });
  })

  // Delete user by ID
  .delete((req, res) => {
    Users.deleteOne({ _id: req.params.id })
      .then((result) => {
        if (result.deletedCount === 1) { // Successful deletion
          return res.json({ message: `User with id: ${req.params.id} was successfully deleted`, result });
        } else {
          return res.status(500).json({ message: 'Resource not able to be deleted', result });
        }
      })
      .catch((error) => {
        return res.status(500).json(error);
      });
  });

export default router;
