import axios, { AxiosResponse } from 'axios';
import { LICHESS_URL } from 'helpers/constants';
import { Readable } from 'stream';
import { LichessGame } from 'types/lichess';

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

const numMoves = (g: LichessGame) => g.moves.split(' ').length;

const takeLess = <D>(fn: (d: D) => number) => (a: D, b: D): D => (fn(a) > fn(b) ? b : a);

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
};

export default lichessService;
