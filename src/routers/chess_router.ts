import bodyParser from 'body-parser';
import express from 'express';
import { body} from 'express-validator';

import { Chess } from '../models';
import { requireAuth } from '../authentication';
import { playersValidation } from '../helpers/validation';
import { chessController } from '../controllers';

const router = express();

// TODO: Move middleware attachment to test file
if (process.env.NODE_ENV === 'test') {
  // enable json message body for posting data to router
  router.use(bodyParser.urlencoded({ extended: true }));
  router.use(bodyParser.json());
}

router
    .route('/')
    .post(
        // requireAuth,
        ...playersValidation,
        chessController.createChessGameRequest
    )

export default router;