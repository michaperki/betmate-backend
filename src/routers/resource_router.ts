import bodyParser from 'body-parser';
import express from 'express';

import { requireAuth } from '../authentication';
import { resourceController } from '../controllers';

const router = express();

// TODO: Move middleware attachment to test file
if (process.env.NODE_ENV === 'test') {
  // enable json message body for posting data to router
  router.use(bodyParser.urlencoded({ extended: true }));
  router.use(bodyParser.json());
}

// find and return all resources
router.route('/')
  .get(resourceController.getAllResources)
  .post(requireAuth, resourceController.createResource);

// // ! TESTING ONLY
// .delete(requireAuth, async (req, res) => {
//   try {
//     await Resources.deleteMany({ })
//     return res.status(200).json({ message: 'Successfully deleted all resources.' });
//   } catch (error) {
//     return res.status(500).json({ message: error.message });
//   }
// });

router.route('/:id')
  .get(resourceController.getResource)
  .put(requireAuth, resourceController.updateResource)

  .delete(requireAuth, resourceController.deleteResource);

export default router;
