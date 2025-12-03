import express, { Express } from 'express';
import bodyParser from 'body-parser';
import { Namespace } from 'socket.io';
import { handleValidationError } from '../validation';
import { createValidator } from 'express-joi-validation';
import { ChessEmitEvents, ChessListenEvents } from '../types/websocket';
import { CreateGameIDSchema, CreateGameURLSchema, CreateStreamerGameSchema } from '../validation/lichess';
import { lichessController } from '../controllers';
import { requireAuth } from '../authentication';
import { logDebug } from '../helpers/dev_logger';

const routerWithSocket = (socket: Namespace<ChessListenEvents, ChessEmitEvents>): Express => {
  const router = express();
  const validator = createValidator({ passError: true });

  if (process.env.NODE_ENV === 'test') {
  // enable json message body for posting data to router
    router.use(bodyParser.urlencoded({ extended: true }));
    router.use(bodyParser.json());
  }

  router
    .route('/url')
    .post(
      requireAuth,
      validator.body(CreateGameURLSchema),
      lichessController.convertUrlToId,
      validator.body(CreateGameIDSchema),
      lichessController.createLichessStream(socket),
    );

  router
    .route('/id')
    .post(
      requireAuth,
      validator.body(CreateGameIDSchema),
      lichessController.createLichessStream(socket),
    );

  router
    .route('/streamer')
    .get(lichessController.getStreamers)
    .post(
      requireAuth,
      (req, res, next) => { logDebug(req.body); next(); },
      validator.body(CreateStreamerGameSchema),
      lichessController.getStreamerGame,
      validator.body(CreateGameIDSchema),
      lichessController.createLichessStream(socket),
    );

  if (process.env.NODE_ENV === 'test') {
    router.use(handleValidationError);
  }

  return router;
};

export default routerWithSocket;
