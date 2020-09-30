/* eslint-disable consistent-return */
import bodyParser from 'body-parser';
import express from 'express';
import validator from 'email-validator';

import { userController } from '../controllers';
import { requireSignin } from '../authentication';
import { Users } from '../models';

import { getFieldNotFoundError } from '../helpers/constants';

const router = express();

// TODO: Move middleware attachment to test file
if (process.env.NODE_ENV === 'test') {
  // enable json message body for posting data to router
  router.use(bodyParser.urlencoded({ extended: true }));
  router.use(bodyParser.json());
}

router.route('/signup')
  .post(async (req, res) => {
    try {
      const {
        email, password, firstName, lastName,
      } = req.body;

      // Validate email and password
      if (!email || !validator.validate(email)) {
        return res.status(400).json({ message: 'Please enter a valid email address' });
      } else if (!password) {
        return res.status(400).json({ message: getFieldNotFoundError('password') });
      }

      // Check if a user already has this email address
      const user = await Users.findOne({ email });
      if (user) { return res.status(409).json({ message: 'Email address already associated to a user' }); }

      // Make a new user from passed data
      const newUser = new Users({
        email: email.toLowerCase(),
        password,
        first_name: firstName || '',
        last_name: lastName || '',
      });

      // Save the user then transmit to frontend
      const savedUser = await newUser.save();
      const json = savedUser.toJSON();
      delete json.password;
      return res.status(201).json({ token: userController.tokenForUser(savedUser), user: json });
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });

// Send user object and server will send back authToken and user object
router.route('/signin')
  .post(requireSignin, (req, res) => {
    // This information is loaded or rejected by passport
    const json = req.user.toJSON();
    delete json.password;
    return res.json({ token: userController.tokenForUser(json), user: json });
  });

export default router;
