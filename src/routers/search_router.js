import express from 'express';

import { searchController } from '../controllers';

const router = express();

router.route('/')

  // Main query-based search
  .get(async (req, res) => {
    try {
      // Add any additional filters here. NOTE: Shorten these for cleanliness in URL
      const { query, maxValue } = req.query; // Params that don't need defaults
      const sort = req.query.sort || 'a'; // Params that need defaults

      // Parse strings to numbers
      const page = parseInt(req.query.page, 10) || 1;
      const numPerPage = parseInt(req.query.numperpage, 10) || 10;

      const queryObject = {
        $and: [
          // Query title and description if query sting exists
          query ? {
            $or: [
              { title: { $regex: new RegExp(query, 'i') } }, // Note: regexp can become inefficient for large collections, look into indexing
              { description: { $regex: new RegExp(query, 'i') } }, // See here: https://stackoverflow.com/questions/7101703/how-do-i-make-case-insensitive-queries-on-mongodb
            ],
          } : {},
          {
            $and: [
              maxValue ? { value: { $lte: maxValue } } : {}, // Only implement if maxValue is defined
              // Implement additional filters here
            ],
          },
        ],
      };

      // Call search() controller with generated parameters
      const results = await searchController.search(queryObject, sort, page, numPerPage);
      return res.status(200).json({ results, numResults: results.length });
    } catch (error) {
      return res.status(500).json(error);
    }
  });

export default router;
