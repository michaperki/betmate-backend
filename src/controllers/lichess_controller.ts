import { RequestHandler } from 'express';
import { ValidatedRequest } from 'express-joi-validation';
import HttpError from 'helpers/errors';
import lichessService from 'services/lichess_service';
import { Namespace } from 'socket.io';
import { ChessEmitEvents, ChessListenEvents } from 'types/websocket';
import { CreateGameIDRequest, CreateGameURLRequest } from 'validation/lichess';
import { getStream } from 'websockets/lichess_stream';
import { handleFailure, handleSuccess } from './utils';

export const convertUrlToId: RequestHandler = (req: ValidatedRequest<CreateGameURLRequest>, _res, next) => {
  const [id] = req.body.url.split('/').slice(-1);
  (req as any as ValidatedRequest<CreateGameIDRequest>).body = { id };
  next();
};

export const createLichessStream = (socket: Namespace<ChessListenEvents, ChessEmitEvents>): RequestHandler => (
  async (req: ValidatedRequest<CreateGameIDRequest>, res) => {
    try {
      const numStreams = await lichessService.getActiveStreams();
      if (numStreams >= 8) throw new HttpError(400, ['Stream quota filled']);

      const game = await lichessService.getGame(req.body.id);

      const gameFields = lichessService.createChessModelFields(game);

      const gameId = await getStream(game.id, gameFields, socket);

      handleSuccess(res)({ gameId });
    } catch (error) {
      handleFailure(res)(error);
    }
  }
);

const lichessController = {
  convertUrlToId,
  createLichessStream,
};

export default lichessController;
