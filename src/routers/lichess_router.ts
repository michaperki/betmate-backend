import express, { Express } from 'express';
import bodyParser from 'body-parser';
import { Namespace } from 'socket.io';
import { ChessEmitEvents, ChessListenEvents } from 'types/websocket';
import { handleValidationError } from 'validation';

const routerWithSocket = (socket: Namespace<ChessListenEvents, ChessEmitEvents>): Express => {
  const router = express();

  if (process.env.NODE_ENV === 'test') {
  // enable json message body for posting data to router
    router.use(bodyParser.urlencoded({ extended: true }));
    router.use(bodyParser.json());
  }

  router
    .route('/')
    .get((req, res) => res.send('This works'));

  if (process.env.NODE_ENV === 'test') {
    router.use(handleValidationError);
  }

  return router;
};
export default routerWithSocket;
