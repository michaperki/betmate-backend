import { RequestHandler } from 'express';
// import validator from 'email-validator';
// import { getFieldNotFoundError } from 'helpers/constants';
import { Users } from 'models';
import userController from 'controllers/user_controller';
import { RequestWithJWT } from 'types/requests';
import { UserDoc } from 'types/models';

const signUpUser = (email: string, password: string, firstName: string | null, lastName: string | null): Promise<UserDoc> => (
  new Users({
    email,
    password,
    first_name: firstName || '',
    last_name: lastName || '',
  }).save()
);

const emailAvailable = (email: string): Promise<boolean> => (
  Users
    .findOne({ email })
    .then((doc) => !doc)
    .catch(() => false)
);

const signUpUserRequest: RequestHandler = async (req, res) => {
  try {
    const {
      email, password, firstName, lastName,
    } = req.body;

    // Save the user then transmit to frontend
    const savedUser = await signUpUser(email, password, firstName, lastName);
    return res.status(201).json({ token: userController.tokenForUser(savedUser), user: savedUser });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

const signInUser: RequestHandler = (req: RequestWithJWT, res) => (
  res.json({ token: userController.tokenForUser(req.user), user: req.user })
);

const jwtSignIn: RequestHandler = (req: RequestWithJWT, res) => (
  res.json({ user: req.user })
);

const authController = {
  signUpUserRequest,
  signInUser,
  jwtSignIn,
  emailAvailable,
};

export default authController;
