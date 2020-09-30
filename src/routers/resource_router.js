import bodyParser from 'body-parser';
import express from 'express';

import { Resources } from '../models';
import { requireAuth } from '../authentication';
import { documentNotFoundError, getFieldNotFoundError, getSuccessfulDeletionMessage } from '../helpers/constants';

const router = express();

// TODO: Move middleware attachment to test file
if (process.env.NODE_ENV === 'test') {
  // enable json message body for posting data to router
  router.use(bodyParser.urlencoded({ extended: true }));
  router.use(bodyParser.json());
}

// find and return all resources
router.route('/')
  .get(async (req, res) => {
    try {
      const resources = await Resources.find({});
      return res.status(200).json(resources);
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  })

  .post(requireAuth, async (req, res) => {
    try {
      const resource = new Resources();
      const { title, description, value } = req.body;

      if (!title) return res.status(400).json({ message: getFieldNotFoundError('title') });
      if (!description) return res.status(400).json({ message: getFieldNotFoundError('description') });
      if (!value) return res.status(400).json({ message: getFieldNotFoundError('value') });

      resource.title = title;
      resource.description = description;
      resource.value = value;
      resource.date_resource_created = Date.now();

      const savedResource = await resource.save();
      return res.status(201).json(savedResource);
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });

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
  .get(async (req, res) => {
    try {
      const resource = await Resources.findById(req.params.id);
      return res.status(200).json(resource);
    } catch (error) {
      if (error.kind === 'ObjectId') {
        return res.status(404).json({ message: documentNotFoundError });
      } else {
        return res.status(500).json({ message: error.message });
      }
    }
  })

  .put(requireAuth, async (req, res) => {
    try {
      const resource = await Resources.findOneAndUpdate({ _id: req.params.id }, req.body, { useFindAndModify: false, new: true });
      return res.status(200).json(resource);
    } catch (error) {
      if (error.kind === 'ObjectId') {
        return res.status(404).json({ message: documentNotFoundError });
      } else {
        return res.status(500).json({ message: error.message });
      }
    }
  })

  .delete(requireAuth, async (req, res) => {
    try {
      await Resources.findOneAndDelete({ _id: req.params.id }, { useFindAndModify: false });
      return res.status(200).json({ message: getSuccessfulDeletionMessage(req.params.id) });
    } catch (error) {
      if (error.kind === 'ObjectId') {
        return res.status(404).json({ message: documentNotFoundError });
      } else {
        return res.status(500).json({ message: error.message });
      }
    }
  });

export default router;
