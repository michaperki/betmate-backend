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
    // res.send(game);

    const gameFields = {
      player_white: {
        name: game.players.white.user.name,
        elo: game.players.white.rating,
      },
      player_black: {
        name: game.players.black.user.name,
        elo: game.players.black.rating,
      },
      time_format: `${game.clock.totalTime}+${game.clock.increment}`,
      time_white: game.clock.initial,
      time_black: game.clock.initial,
    };

    const gameId = await getStream(game.id, gameFields, socket);
    res.send({ gameId });
  }
);

const lichessController = {
  convertUrlToId,
  createLichessStream,
};

export default lichessController;
