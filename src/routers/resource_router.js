import bodyParser from 'body-parser';
import express from 'express';

import { Resources } from '../models';
import requireAuth from '../authentication/requireAuth'; // TODO: Change back to indexed

const router = express();

// enable json message body for posting data to router
router.use(bodyParser.urlencoded({ extended: true }));
router.use(bodyParser.json());

// find and return all resources
router.route('/')

  // Get all resources
  .get((req, res) => {
    Resources.find({}).then((resources) => {
      return res.json(resources);
    }).catch((error) => {
      return res.status(500).json({ message: error.message });
    });
  })

  // Create new resource (SECURE)
  .post(requireAuth, (req, res) => {
    const resource = new Resources();

    const { title, description, value } = req.body;

    if (!title) return res.status(400).json({ message: 'Missing required "title" field' });
    if (!description) return res.status(400).json({ message: 'Missing required "description" field' });
    if (!value) return res.status(400).json({ message: 'Missing required "value" field' });

    resource.title = title;
    resource.description = description;
    resource.value = value;
    resource.date_resource_created = Date.now();

    resource.save()
      .then((savedResource) => {
        return res.status(201).json(savedResource);
      }).catch((error) => {
        return res.status(500).json({ message: error.message });
      });
  })

  // Delete all resources (SECURE, TESTING ONLY)
  .delete(requireAuth, (req, res) => {
    Resources.deleteMany({ })
      .then(() => {
        return res.json({ message: 'Successfully deleted all resources.' });
      })
      .catch((error) => {
        return res.status(500).json({ message: error.message });
      });
  });

router.route('/:id')

  // Get resource by id
  .get((req, res) => {
    Resources.findById(req.params.id)
      .then((resource) => {
        return res.json(resource);
      })
      .catch((error) => {
        if (error.message && error.message.startsWith('Resource with id:')) {
          return res.status(404).json({ message: 'Couldn\'t find resource with given id' });
        } else {
          return res.status(500).json({ message: error.message });
        }
      });
  })

  // Update resource by id (SECURE)
  .put(requireAuth, (req, res) => {
    console.log('req body update', req.body, req.params.id);
    Resources.findOneAndUpdate({ _id: req.params.id }, req.body, { new: true }).then((resource) => {
      console.log('update one by id', req.params.id, resource);

      if (Object.keys(resource).length) return res.json(resource);
      else return res.status(404).json({ message: 'Couldn\'t find resource with given id' });
    })
      .catch((error) => {
        return res.status(500).json({ message: error.message });
      });
  })

  // Delete resource by id, SECURE
  .delete(requireAuth, (req, res) => {
    Resources.findByIdAndDelete(req.params.id)
      .then((meta) => {
        // console.log('delete one by id', req.params.id, meta);
        if (meta.deletedCount < 1) return res.status(404).json({ message: 'Couldn\'t find resource with given id' });
        else return res.json({ message: `Resource with id: ${req.params.id} was successfully deleted` });
      })
      .catch((error) => {
        return res.status(500).json({ message: error.message });
      });
  });

export default router;
