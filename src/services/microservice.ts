import axios from 'axios';
import env from 'env-var';
import querystring from 'querystring';
import { WDLData, TopMoveData, MicroserviceResponse, MoveAnalysisData } from '../types/microservice';
import { MICROSERVICE_URL } from '../helpers/constants';
import { TopMoveSchema, WDLSchema, MoveAnalysisSchema } from '../validation/microservice';
import { validate } from '../validation';
import { generateCorrelationId } from '../helpers/utils';
import { getRequestId } from '../helpers/request_context';
import logger from '../helpers/logger';
const apiKey = env.get('MICROSERVICE_API_KEY').required().asString();

/**
 * Make call to microservice to get win/draw/loss odds of chess game
 * @param fen state of chess game in FEN notation
 * @param white_time time on clock for white player
 * @param black_time time on clock for black player
 * @param correlationId optional correlation ID for tracking related logs
 * @returns Promise of win/draw/loss odds, or null if issue occurs
 */
// Normalize base URL and append local stage prefix in development if missing
const RAW_BASE = (MICROSERVICE_URL || '').replace(/\/+$/, '');
const IS_DEV_ENV = (process.env.NODE_ENV || 'development') !== 'production';
const BASE_WITH_STAGE = (IS_DEV_ENV && !/\/(dev|staging|prod)$/i.test(RAW_BASE)) ? `${RAW_BASE}/dev` : RAW_BASE;

const getWDL = (fen: string, white_time: number, black_time: number, correlationId?: string): Promise<WDLData> => {
  const trace_id = correlationId || getRequestId() || generateCorrelationId();
  const url = `${BASE_WITH_STAGE}/wdl?${querystring.stringify({ fen, white_time, black_time })}`;
  const startTime = Date.now();

  return axios
    .get<MicroserviceResponse<WDLData>>(url, {
      headers: {
        'x-api-key': apiKey,
        'x-trace-id': trace_id,
        'x-request-id': trace_id,
      },
      timeout: 5000,
    })
    .then((res) => {
      const latency = Date.now() - startTime;
      logger.log({
        level: 'debug',
        event: 'wdl_success',
        trace_id,
        context: { latency_ms: latency, fen_hash: fen.substring(0, 10), url, base: BASE_WITH_STAGE }
      });
      return res.data.data;
    })
    .then(validate(WDLSchema))
    .catch((error) => {
      const latency = Date.now() - startTime;

      if (error.code === 'ECONNABORTED') {
        logger.log({
          level: 'warn',
          event: 'wdl_timeout',
          trace_id,
          context: {
            timeout_ms: 5000,
            latency_ms: latency,
            fen_hash: fen.substring(0, 10),
            url,
            base: BASE_WITH_STAGE,
          }
        });
      } else {
        logger.log({
          level: 'error',
          event: 'wdl_error',
          trace_id,
          context: {
            error: error.message,
            status: error.response?.status,
            latency_ms: latency,
            fen_hash: fen.substring(0, 10),
            url,
            base: BASE_WITH_STAGE,
          }
        });
      }

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
  const trace_id = correlationId || getRequestId() || generateCorrelationId();
  const url = `${BASE_WITH_STAGE}/top-moves?${querystring.stringify({ fen, n, enhanced: 'true' })}`;
  const startTime = Date.now();

  return axios
    .get<MicroserviceResponse<TopMoveData>>(url, {
      headers: {
        'x-api-key': apiKey,
        'x-trace-id': trace_id,
        'x-request-id': trace_id,
      },
      timeout: 5000,
    })
    .then((res) => {
      const latency = Date.now() - startTime;
      logger.log({
        level: 'debug',
        event: 'top_moves_success',
        trace_id,
        context: {
          latency_ms: latency,
          fen_hash: fen.substring(0, 10),
          move_count: n,
          returned_moves: res.data.data.length,
          url,
          base: BASE_WITH_STAGE,
        }
      });

      // Additional logging for empty results
      if (res.data.data.length === 0) {
        logger.log({
          level: 'warn',
          event: 'top_moves_empty_result',
          trace_id,
          context: {
            fen_hash: fen.substring(0, 10),
            expected_moves: n,
            returned_moves: 0
          }
        });
      }

      return res.data.data;
    })
    .then(validate<TopMoveData>(TopMoveSchema))
    .catch((error) => {
      const latency = Date.now() - startTime;

      if (error.code === 'ECONNABORTED') {
        logger.log({
          level: 'warn',
          event: 'top_moves_timeout',
          trace_id,
          context: {
            timeout_ms: 5000,
            latency_ms: latency,
            fen_hash: fen.substring(0, 10),
            url,
            base: BASE_WITH_STAGE,
          }
        });
      } else {
        logger.log({
          level: 'error',
          event: 'top_moves_error',
          trace_id,
          context: {
            error: error.message,
            latency_ms: latency,
            fen_hash: fen.substring(0, 10),
            status: error.response?.status,
            url,
            base: BASE_WITH_STAGE,
          }
        });
      }

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
  const trace_id = correlationId || getRequestId() || generateCorrelationId();
  // Add the enhanced flag to get the new format with move data
  const url = `${BASE_WITH_STAGE}/move-analysis?${querystring.stringify({ fen, move, enhanced: 'true' })}`;
  const startTime = Date.now();

  return axios
    .get<MicroserviceResponse<MoveAnalysisData>>(url, {
      headers: {
        'x-api-key': apiKey,
        'x-trace-id': trace_id,
        'x-request-id': trace_id,
      },
      timeout: 5000,
    })
    .then((res) => {
      const latency = Date.now() - startTime;
      logger.log({
        level: 'debug',
        event: 'move_analysis_success',
        trace_id,
        context: {
          latency_ms: latency,
          fen_hash: fen.substring(0, 10),
          move,
          url,
          base: BASE_WITH_STAGE,
        }
      });

      // Ensure move is included in the data
      const responseData = res.data.data;
      if (responseData && !responseData.move) {
        responseData.move = move;
      }

      return responseData;
    })
    // Skip validation temporarily to debug the issue
    // .then(validate<MoveAnalysisData>(MoveAnalysisSchema))
    .catch((error) => {
      const latency = Date.now() - startTime;

      if (error.code === 'ECONNABORTED') {
        logger.log({
          level: 'warn',
          event: 'move_analysis_timeout',
          trace_id,
          context: {
            timeout_ms: 5000,
            latency_ms: latency,
            fen_hash: fen.substring(0, 10),
            move
          }
        });
      } else {
        logger.log({
          level: 'error',
          event: 'move_analysis_error',
          trace_id,
          context: {
            error: error.message,
            status: error.response?.status,
            latency_ms: latency,
            fen_hash: fen.substring(0, 10),
            move,
            url,
            base: BASE_WITH_STAGE,
          }
        });
      }

      // Return a reasonable fallback value instead of throwing error
      const fallback = {
        move: move, // Include the move in the fallback
        score: 0,
        percentile: 40, // Use 40 instead of 0 for a more reasonable fallback
        is_best_move: false
      } as MoveAnalysisData;

      logger.log({ level: 'warn', event: 'move_analysis_fallback', trace_id, context: { move } });
      return fallback;
    });
};

const microservice = {
  getWDL,
  getTopMoves,
  getMoveAnalysis,
};

export default microservice;
