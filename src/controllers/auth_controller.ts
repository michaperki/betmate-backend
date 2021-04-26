import { RequestHandler } from 'express';
import validator from 'email-validator';
import { getFieldNotFoundError } from 'helpers/constants';
import { Users } from 'models';
import userController from 'controllers/user_controller';
import { RequestWithJWT } from 'types/requests';

const signUpUser: RequestHandler = async (req, res) => {
  try {
    const {
      email, password, firstName, lastName,
    } = req.body;

    // Validate email and password
    if (!email || !validator.validate(email)) {
      return res.status(400).json({ message: 'Please enter a valid email address' });
    } if (!password) {
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
};

const signInUser: RequestHandler = (req: RequestWithJWT, res) => {
  // This information is loaded or rejected by passport
  const json = req.user.toJSON();
  delete json.password;
  return res.json({ token: userController.tokenForUser(json), user: json });
};

const authController = {
  signUpUser,
  signInUser,
};

export default authController;
