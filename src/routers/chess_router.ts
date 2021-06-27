import bodyParser from 'body-parser';
import express from 'express';
import { createValidator } from 'express-joi-validation';

// import { chessFilterParams, containsPlayers, optionalChessFieldsValid } from 'helpers/validation/chess';
import { chessController } from 'controllers';
// import { cannotQueryTimestamps, validateRequest } from 'helpers/validation';
import { CreateGameSchema, GetManyGamesSchema, UpdateGameSchema } from 'validation/chess';
import { checkErrors } from 'validation';

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
    // ...chessFilterParams,
    // ...cannotQueryTimestamps,
    // validateRequest,
    validator.query(GetManyGamesSchema),
    checkErrors,
    chessController.getManyChessGamesRequest,
  )
  .post(
    // requireAuth,
    // ...containsPlayers,
    // ...optionalChessFieldsValid,
    // validateRequest,
    validator.body(CreateGameSchema),
    checkErrors,
    chessController.createChessGameRequest,
  );

router.route('/:id')
  .get(chessController.getChessGameRequest)
  .put(validator.body(UpdateGameSchema), checkErrors, chessController.updateChessGameRequest);

export default router;
