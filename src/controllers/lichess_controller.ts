import { RequestHandler } from 'express';
import { ValidatedRequest } from 'express-joi-validation';
import lichessService from 'services/lichess_service';
import { Namespace } from 'socket.io';
import { ChessEmitEvents, ChessListenEvents } from 'types/websocket';
import { CreateGameIDRequest, CreateGameURLRequest } from 'validation/lichess';
import { getStream } from 'websockets/lichess_stream';

export const convertUrlToId: RequestHandler = (req: ValidatedRequest<CreateGameURLRequest>, _res, next) => {
  const [id] = req.body.url.split('/').slice(-1);
  (req as any as ValidatedRequest<CreateGameIDRequest>).body = { id };
  next();
};

export const createLichessStream = (socket: Namespace<ChessListenEvents, ChessEmitEvents>): RequestHandler => (
  async (req: ValidatedRequest<CreateGameIDRequest>, res) => {
    const game = await lichessService.getGame(req.body.id);

    const gameFields = lichessService.createChessModelFields(game);

    const gameId = await getStream(game.id, gameFields, socket);

    res.status(200).send({ gameId });
  }
);

const lichessController = {
  convertUrlToId,
  createLichessStream,
};

export default lichessController;
