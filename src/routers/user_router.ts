import bodyParser from 'body-parser';
import express from 'express';

import { requireAuth } from '../authentication';
import { userController } from '../controllers';

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
  .get(userController.getAllUsers)
  .post(userController.createNewUser);

// Create new user

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
  .get(userController.getUser)
  .put(userController.updateUser)
  .delete(userController.deleteUser);

export default router;
