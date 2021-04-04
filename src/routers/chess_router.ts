import bodyParser from 'body-parser';
import express from 'express';
import { body} from 'express-validator';

import { Chess } from '../models';
import { requireAuth } from '../authentication';
import { documentNotFoundError, getFieldNotFoundError, getSuccessfulDeletionMessage } from '../helpers/constants';
import { chessController } from '../controllers';

const router = express();

// TODO: Move middleware attachment to test file
if (process.env.NODE_ENV === 'test') {
  // enable json message body for posting data to router
  router.use(bodyParser.urlencoded({ extended: true }));
  router.use(bodyParser.json());
}

router
    .post(
        '/create',
        // requireAuth,
        body('players').isArray({ min: 2, max: 2 }).withMessage('Must be array of length 2'),
        body('players.*').isString().withMessage('Elements must be strings'),
        chessController.createChessGame
    )

export default router;