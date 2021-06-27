import bodyParser from 'body-parser';
import express from 'express';
import { createValidator } from 'express-joi-validation';

import { chessController } from 'controllers';
import { CreateGameSchema, GetManyGamesSchema, UpdateGameSchema } from 'validation/chess';
import { validateRequest } from 'validation';

const router = express();
const validator = createValidator({ passError: true });

// TODO: Move middleware attachment to test file
if (process.env.NODE_ENV === 'test') {
  // enable json message body for posting data to router
  router.use(bodyParser.urlencoded({ extended: true }));
  router.use(bodyParser.json());
}

router
  .route('/')
  .get(
    validator.query(GetManyGamesSchema),
    validateRequest,
    chessController.getManyChessGamesRequest,
  )
  .post(
    // requireAuth,
    validator.body(CreateGameSchema),
    validateRequest,
    chessController.createChessGameRequest,
  );

router.route('/:id')
  .get(chessController.getChessGameRequest)
  .put(validator.body(UpdateGameSchema), validateRequest, chessController.updateChessGameRequest);

export default router;
