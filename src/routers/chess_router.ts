import bodyParser from 'body-parser';
import express from 'express';

import { chessFilterParams, containsPlayers, optionalChessFieldsValid } from 'helpers/validation/chess';
import { chessController } from 'controllers';
import { cannotQueryTimestamps, validateRequest } from 'helpers/validation';

const router = express();

// TODO: Move middleware attachment to test file
if (process.env.NODE_ENV === 'test') {
  // enable json message body for posting data to router
  router.use(bodyParser.urlencoded({ extended: true }));
  router.use(bodyParser.json());
}

router
  .route('/')
  .get(
    ...chessFilterParams,
    ...cannotQueryTimestamps,
    validateRequest,
    chessController.getManyChessGamesRequest,
  )
  .post(
    // requireAuth,
    ...containsPlayers,
    ...optionalChessFieldsValid,
    validateRequest,
    chessController.createChessGameRequest,
  );

router.route('/:id')
  .get(chessController.getChessGameRequest)
  .put(...optionalChessFieldsValid, validateRequest, chessController.updateChessGameRequest);

export default router;
