import bodyParser from 'body-parser';
import express from 'express';

import { containsPlayers, optionalChessFieldsValid } from '../helpers/validation';
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
    ...containsPlayers,
    ...optionalChessFieldsValid,
    chessController.createChessGameRequest,
  );

// FOR TESTING ONLY
router.route('/:id')
  .put(chessController.updateChessGameRequest);

export default router;
