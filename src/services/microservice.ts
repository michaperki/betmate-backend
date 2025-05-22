import axios from 'axios';
import env from 'env-var';
import querystring from 'querystring';
import { WDLData, TopMoveData, MicroserviceResponse, MoveAnalysisData } from '../types/microservice';
import { MICROSERVICE_URL } from '../helpers/constants';
import { TopMoveSchema, WDLSchema, MoveAnalysisSchema } from '../validation/microservice';
import { validate } from '../validation';
import { generateCorrelationId } from '../helpers/utils';
const apiKey = env.get('MICROSERVICE_API_KEY').required().asString();

/**
 * Make call to microservice to get win/draw/loss odds of chess game
 * @param fen state of chess game in FEN notation
 * @param white_time time on clock for white player
 * @param black_time time on clock for black player
 * @param correlationId optional correlation ID for tracking related logs
 * @returns Promise of win/draw/loss odds, or null if issue occurs
 */
const getWDL = (fen: string, white_time: number, black_time: number, correlationId?: string): Promise<WDLData> => {
  const cid = correlationId || generateCorrelationId();
  const url = `${MICROSERVICE_URL}/wdl?${querystring.stringify({ fen, white_time, black_time })}`;
  const startTime = Date.now();
  console.log(`[${cid}] [Microservice] Calling WDL endpoint`);
  return axios
    .get<MicroserviceResponse<WDLData>>(url, {
      headers: { 'x-api-key': apiKey },
      timeout: 5000, // Add a reasonable timeout
    })
    .then((res) => {
      const latency = Date.now() - startTime;
      console.log(`[${cid}] [Microservice] WDL completed in ${latency}ms`);
      return res.data.data;
    })
    .then(validate(WDLSchema))
    .catch((error) => {
      const latency = Date.now() - startTime;
      console.log(`[${cid}] [Microservice] WDL failed after ${latency}ms:`, error.message);
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
 * @param correlationId optional correlation ID for tracking related logs
 * @returns Promise of array containing at least `n` moves in SAN notation, or null if issue occurs
 */
const getTopMoves = (fen: string, n: number, correlationId?: string): Promise<TopMoveData> => {
  const cid = correlationId || generateCorrelationId();
  const url = `${MICROSERVICE_URL}/top-moves?${querystring.stringify({ fen, n })}`;
  const startTime = Date.now();
  console.log(`[${cid}] [Microservice] Calling top-moves endpoint`);
  return axios
    .get<MicroserviceResponse<TopMoveData>>(url, {
      headers: { 'x-api-key': apiKey },
      timeout: 5000, // Add a reasonable timeout
    })
    .then((res) => {
      const latency = Date.now() - startTime;
      console.log(`[${cid}] [Microservice] Top-moves completed in ${latency}ms`);
      return res.data.data;
    })
    .then(validate<TopMoveData>(TopMoveSchema))
    .catch((error) => {
      const latency = Date.now() - startTime;
      console.log(`[${cid}] [Microservice] Top-moves failed after ${latency}ms:`, error.message);
      // Return a fallback empty array instead of throwing error
      return [] as TopMoveData;
    });
};

/**
 * Make call to microservice to analyze a specific move
 * @param fen state of chess game in FEN notation
 * @param move move to analyze in SAN notation
 * @param correlationId optional correlation ID for tracking related logs
 * @returns Promise of move analysis data, or null if issue occurs
 */
const getMoveAnalysis = (fen: string, move: string, correlationId?: string): Promise<MoveAnalysisData> => {
  const cid = correlationId || generateCorrelationId();
  const url = `${MICROSERVICE_URL}/move-analysis?${querystring.stringify({ fen, move })}`;
  const startTime = Date.now();
  console.log(`[${cid}] [Microservice] Calling move-analysis endpoint`);
  return axios
    .get<MicroserviceResponse<MoveAnalysisData>>(url, {
      headers: { 'x-api-key': apiKey },
      timeout: 5000, // Add a reasonable timeout
    })
    .then((res) => {
      const latency = Date.now() - startTime;
      console.log(`[${cid}] [Microservice] Move-analysis completed in ${latency}ms`);
      return res.data.data;
    })
    .then(validate<MoveAnalysisData>(MoveAnalysisSchema))
    .catch((error) => {
      const latency = Date.now() - startTime;
      console.log(`[${cid}] [Microservice] Move-analysis failed after ${latency}ms:`, error.message);
      // Return a reasonable fallback value instead of throwing error
      return {
        score: 0,
        percentile: 50,
        is_best_move: false
      } as MoveAnalysisData;
    });
};

const microservice = {
  getWDL,
  getTopMoves,
  getMoveAnalysis,
};

export default microservice;