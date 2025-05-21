import axios from 'axios';
import env from 'env-var';
import querystring from 'querystring';
import { WDLData, TopMoveData, MicroserviceResponse, MoveAnalysisData } from '../types/microservice';
import { MICROSERVICE_URL } from '../helpers/constants';
import { TopMoveSchema, WDLSchema, MoveAnalysisSchema } from '../validation/microservice';
import { validate } from '../validation';
const apiKey = env.get('MICROSERVICE_API_KEY').required().asString();

/**
 * Make call to microservice to get win/draw/loss odds of chess game
 * @param fen state of chess game in FEN notation
 * @param white_time time on clock for white player
 * @param black_time time on clock for black player
 * @returns Promise of win/draw/loss odds, or null if issue occurs
 */
const getWDL = (fen: string, white_time: number, black_time: number): Promise<WDLData> => {
  const url = `${MICROSERVICE_URL}/wdl?${querystring.stringify({ fen, white_time, black_time })}`;
  console.log(`Calling microservice at: ${url}`);
  return axios
    .get<MicroserviceResponse<WDLData>>(url, {
      headers: { 'x-api-key': apiKey },
      timeout: 5000, // Add a reasonable timeout
    })
    .then((res) => res.data.data)
    .then(validate(WDLSchema))
    .catch((error) => {
      console.log('Microservice error:', error.message);
      console.log('Attempted URL:', url);
      // Return default values instead of throwing error to prevent app crashes
      return {
        white_win: 0.33,
        draw: 0.34,
        black_win: 0.33,
      };
    });
};

/**
 * Make call to microservice to get top `n` best moves of chess game
 * @param fen state of chess game in FEN notation
 * @param n number of moves to get
 * @returns Promise of array containing at least `n` moves in SAN notation, or null if issue occurs
 */
const getTopMoves = (fen: string, n: number): Promise<TopMoveData> => (
  axios
    .get<MicroserviceResponse<TopMoveData>>(`${MICROSERVICE_URL}/top-moves?${querystring.stringify({ fen, n })}`, {
      headers: { 'x-api-key': apiKey },
      timeout: 5000, // Add a reasonable timeout
    })
    .then((res) => res.data.data)
    .then(validate<TopMoveData>(TopMoveSchema))
    .catch((error) => {
      console.log('Microservice error:', error.message);
      // Return a fallback empty array instead of throwing error
      return [] as TopMoveData;
    })
);

/**
 * Make call to microservice to analyze a specific move
 * @param fen state of chess game in FEN notation
 * @param move move to analyze in SAN notation
 * @returns Promise of move analysis data, or null if issue occurs
 */
const getMoveAnalysis = (fen: string, move: string): Promise<MoveAnalysisData> => (
  axios
    .get<MicroserviceResponse<MoveAnalysisData>>(`${MICROSERVICE_URL}/move-analysis?${querystring.stringify({ fen, move })}`, {
      headers: { 'x-api-key': apiKey },
      timeout: 5000, // Add a reasonable timeout
    })
    .then((res) => res.data.data)
    .then(validate<MoveAnalysisData>(MoveAnalysisSchema))
    .catch((error) => {
      console.log('Microservice error:', error.message);
      // Return a reasonable fallback value instead of throwing error
      return {
        score: 0,
        percentile: 50,
        is_best_move: false
      } as MoveAnalysisData;
    })
);

const microservice = {
  getWDL,
  getTopMoves,
  getMoveAnalysis,
};

export default microservice;