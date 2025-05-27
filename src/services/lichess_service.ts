import axios, { AxiosResponse } from 'axios';
import env from 'env-var';
import { LICHESS_URL } from '../helpers/constants';
import { Readable } from 'stream';
import { LichessGame, LichessStreamer } from '../types/lichess';
import {
  ChessDoc, CreateChessQuery, GameSource, GameStatus,
} from '../types/models/chess';
import { passiveValidate } from '../validation';
import { LichessGameSchema, StreamerSchema, sanitizeLichessGame } from '../validation/lichess';
import chessService from './chess_service';
import { numMoves, takeLess } from './utils';

const getGame = (id: string): Promise<LichessGame> => (
  axios({
    method: 'GET',
    url: `${LICHESS_URL}/game/export/${id}`,
    headers: { Accept: 'application/json' },
    params: { pgnInJson: true, opening: false },
  })
    .then((d: AxiosResponse<LichessGame>) => d.data)
    .then((game) => passiveValidate(LichessGameSchema)(sanitizeLichessGame(game)))
    .catch((error) => {
      console.log('Lichess error:', error.message);
      throw error;
    })
);

const getGameStream = (id: string): Promise<Readable> => (
  axios({
    method: 'GET',
    url: `${LICHESS_URL}/api/stream/game/${id}`,
    responseType: 'stream',
    params: { key: env.get('STREAM_KEY').default('').asString() },
  }).then((d: AxiosResponse<Readable>) => d.data)
);

const createChessModelFields = (game: LichessGame, source: GameSource): CreateChessQuery => ({
  player_white: {
    name: game.players.white.user.name,
    elo: game.players.white.rating,
  },
  player_black: {
    name: game.players.black.user.name,
    elo: game.players.black.rating,
  },
  source,
  time_format: `${game.clock.totalTime}+${game.clock.increment}`,
  time_white: game.clock.initial,
  time_black: game.clock.initial,
});

const getTopGame = (): Promise<LichessGame> => (
  axios({
    method: 'GET',
    url: `${LICHESS_URL}/api/tv/rapid`,
    headers: { Accept: 'application/x-ndjson' },
    params: { nb: 30 },
  }).then((res: AxiosResponse<string>) => (
    res.data
      .split('\n')
      .filter((s) => s.length > 0)
      .map((s) => JSON.parse(s))
      .map((g) => passiveValidate(LichessGameSchema)(sanitizeLichessGame(g)))
      .filter((g) => numMoves(g) >= 2)
      .reduce(takeLess(numMoves))
  ))
    .catch((error) => {
      console.log('Lichess error:', error.message);
      throw error;
    })
);

const getActiveGameStreams = (): Promise<ChessDoc[]> => (
  chessService.getManyChessGames({
    game_status: GameStatus.IN_PROGRESS,
    source: { $in: [GameSource.USER, GameSource.STREAMER] },
  })
);

const getActiveStreamers = (): Promise<LichessStreamer[]> => (
  axios({
    method: 'GET',
    url: `${LICHESS_URL}/streamer/live`,
  })
    .then((d) => d.data)
    .then((d) => d.map(passiveValidate(StreamerSchema)))
    .catch((error) => {
      console.log('Lichess error:', error.message);
      throw error;
    })
);

const getUserGame = (userID: string): Promise<LichessGame> => (
  axios({
    method: 'GET',
    url: `${LICHESS_URL}/api/user/${userID}/current-game`,
    headers: { Accept: 'application/json' },
    params: { pgnInJson: true, opening: false },
  })
    .then((d) => d.data)
    .then((game) => passiveValidate(LichessGameSchema)(sanitizeLichessGame(game)))
    .catch((error) => {
      console.log('Lichess error:', error.message);
      throw error;
    })
);

const lichessService = {
  getGame,
  getGameStream,
  getTopGame,
  createChessModelFields,
  getActiveGameStreams,
  getActiveStreamers,
  getUserGame,
};

export default lichessService;
