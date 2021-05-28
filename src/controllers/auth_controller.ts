import { RequestHandler } from 'express';
import { RequestWithJWT } from 'types/requests';
import { userService } from 'services';
import { tokenForUser } from 'helpers/utils';

const signUpUserRequest: RequestHandler = async (req, res) => {
  try {
    const {
      email, password, firstName, lastName,
    } = req.body;

    // Save the user then transmit to frontend
    const user = await userService.createUser(email, password, firstName, lastName);
    return res.status(201).json({ token: tokenForUser(user), user });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

const signInUser: RequestHandler = (req: RequestWithJWT, res) => (
  res.json({ token: tokenForUser(req.user), user: req.user })
);

const jwtSignIn: RequestHandler = (req: RequestWithJWT, res) => (
  res.json({ user: req.user })
);

const authController = {
  signUpUserRequest,
  signInUser,
  jwtSignIn,
};

export default authController;
