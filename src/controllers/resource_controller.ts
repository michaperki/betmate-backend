import { Resources } from "../models";
import { RequestHandler } from 'express'
import {
  documentNotFoundError, getFieldNotFoundError, getSuccessfulDeletionMessage
} from "../helpers/constants";

const getAllResources: RequestHandler = async (req, res) => {
    try {
      const resources = await Resources.find({});
      return res.status(200).json(resources);
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
}

const createResource: RequestHandler = async (req, res) => {
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
  }

const getResource: RequestHandler = async (req, res) => {
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
}

const updateResource: RequestHandler = async (req, res) => {
    try {
      const resource = await Resources.findOneAndUpdate({ _id: req.params.id }, req.body, { new: true });
      return res.status(200).json(resource);
    } catch (error) {
      if (error.kind === 'ObjectId') {
        return res.status(404).json({ message: documentNotFoundError });
      } else {
        return res.status(500).json({ message: error.message });
      }
    }
}

const deleteResource: RequestHandler = async (req, res) => {
    try {
      await Resources.findOneAndDelete({ _id: req.params.id });
      return res.status(200).json({ message: getSuccessfulDeletionMessage(req.params.id) });
    } catch (error) {
      if (error.kind === 'ObjectId') {
        return res.status(404).json({ message: documentNotFoundError });
      } else {
        return res.status(500).json({ message: error.message });
      }
    }
  }

const resourceController = {
    getAllResources,
    createResource,
    getResource,
    updateResource,
    deleteResource
};

export default resourceController;
