import axios from 'axios';
import env from 'env-var';
import dotenv from 'dotenv';
import querystring from 'querystring';
import { WDLData, TopMoveData, MicroserviceResponse } from 'types/microservice';
import { MICROSERVICE_URL } from 'helpers/constants';

dotenv.config();
const apiKey = env.get('MICROSERVICE_API_KEY').required().asString();

/**
 * Make call to microservice to get win/draw/loss odds of chess game
 * @param fen state of chess game in FEN notation
 * @param white_time time on clock for white player
 * @param black_time time on clock for black player
 * @returns Promise of win/draw/loss odds, or null if issue occurs
 */
const getWDL = (fen: string, white_time: number, black_time: number): Promise<WDLData | null> => (
  axios
    .get<MicroserviceResponse<WDLData>>(`${MICROSERVICE_URL}/dev/wdl?${querystring.stringify({ fen, white_time, black_time })}`, { headers: { 'x-api-key': apiKey } })
    .then((res) => res.data.data)
    .catch((error) => {
      const { code, message, stack } = error.toJSON();
      console.log('Microservice error:', { code, message, stack });
      return null;
    })
);

/**
 * Make call to microservice to get top `n` best moves of chess game
 * @param fen state of chess game in FEN notation
 * @param n number of moves to get
 * @returns Promise of array containing at least `n` moves in SAN notation, or null if issue occurs
 */
const getTopMoves = (fen: string, n: number): Promise<TopMoveData | null> => (
  axios
    .get<MicroserviceResponse<TopMoveData>>(`${MICROSERVICE_URL}/dev/top-moves?${querystring.stringify({ fen, n })}`, { headers: { 'x-api-key': apiKey } })
    .then((res) => res.data.data)
    .catch((error) => {
      const { code, message, stack } = error.toJSON();
      console.log('Microservice error:', { code, message, stack });
      return null;
    })
);

const microservice = {
  getWDL,
  getTopMoves,
};

export default microservice;
