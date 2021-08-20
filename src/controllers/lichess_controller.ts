/* eslint-disable no-nested-ternary */
import { RequestHandler } from 'express';
import { ValidatedRequest } from 'express-joi-validation';
import { samePlayers } from 'helpers/chess_logic';
import HttpError from 'helpers/errors';
import lichessService from 'services/lichess_service';
import { Namespace } from 'socket.io';
import { GameSource } from 'types/models/chess';
import { UserRole } from 'types/models/user';
import { ValidatedRequestWithJWT } from 'types/requests';
import { ChessEmitEvents, ChessListenEvents } from 'types/websocket';
import { CreateGameIDRequest, CreateGameURLRequest } from 'validation/lichess';
import { getStream } from 'websockets/lichess_stream';
import { handleFailure, handleSuccess } from './utils';

export const convertUrlToId: RequestHandler = (req: ValidatedRequestWithJWT<CreateGameURLRequest>, _res, next) => {
  const [id] = req.body.url.split('/').slice(-1);
  (req as any as ValidatedRequest<CreateGameIDRequest>).body = { id };
  next();
};

export const createLichessStream = (socket: Namespace<ChessListenEvents, ChessEmitEvents>): RequestHandler => (
  async (req: ValidatedRequestWithJWT<CreateGameIDRequest>, res) => {
    try {
      const streams = await lichessService.getActiveStreams();

      const numUserStreams = streams.filter((g) => g.source === GameSource.USER).length;
      const numStreamerStreams = streams.filter((g) => g.source === GameSource.STREAMER).length;
      const isStreamer = req.user.role === UserRole.STREAMER;

      const source = isStreamer && (numStreamerStreams < 2) ? GameSource.STREAMER
        : numUserStreams < 4 ? GameSource.USER
          : undefined;

      if (!source) throw new HttpError(400, ['Game quota filled. Remaining slots if available are for streamers.']);

      const game = await lichessService.getGame(req.body.id);

      const gameFields = lichessService.createChessModelFields(game, source);

      const gameExists = streams.some(samePlayers(gameFields));
      if (gameExists) throw new HttpError(400, ['Game already exists. Please find another one.']);

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
