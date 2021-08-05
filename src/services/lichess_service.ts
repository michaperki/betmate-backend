import axios, { AxiosResponse } from 'axios';
import { LICHESS_URL } from 'helpers/constants';
import { Readable } from 'stream';
import { PartialWithRequired } from 'types';
import { LichessGame } from 'types/lichess';
import { ChessDoc } from 'types/models/chess';
import { numMoves, takeLess } from './utils';

const getGame = (id: string): Promise<LichessGame> => (
  axios({
    method: 'GET',
    url: `${LICHESS_URL}/game/export/${id}`,
    headers: { Accept: 'application/json' },
    params: { pgnInJson: true },
  }).then((d: AxiosResponse<LichessGame>) => d.data)
);

const getStream = (id: string): Promise<Readable> => (
  axios({
    method: 'GET',
    url: `${LICHESS_URL}/api/stream/game/${id}`,
    responseType: 'stream',
  }).then((d: AxiosResponse<Readable>) => d.data)
);

const createChessModelFields = (game: LichessGame): PartialWithRequired<ChessDoc, 'player_white' | 'player_black'> => ({
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
      .reduce(takeLess(numMoves))
  ))
);

const lichessService = {
  getGame,
  getStream,
  getTopGame,
  createChessModelFields,
};

export default lichessService;
