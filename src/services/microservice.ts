import axios from 'axios';
import env from 'env-var';
import querystring from 'querystring';
import { WDLData, TopMoveData, MicroserviceResponse, MoveAnalysisData } from '../types/microservice';
import { MICROSERVICE_URL } from '../helpers/constants';
import { TopMoveSchema, WDLSchema, MoveAnalysisSchema } from '../validation/microservice';
import { validate } from '../validation';
import { generateCorrelationId } from '../helpers/utils';
import logger from '../helpers/axiom_logger';
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
  const trace_id = correlationId || generateCorrelationId();
  const url = `${MICROSERVICE_URL}/wdl?${querystring.stringify({ fen, white_time, black_time })}`;
  const startTime = Date.now();

  return axios
    .get<MicroserviceResponse<WDLData>>(url, {
      headers: {
        'x-api-key': apiKey,
        'x-trace-id': trace_id
      },
      timeout: 5000,
    })
    .then((res) => {
      const latency = Date.now() - startTime;
      logger.log({
        level: 'debug',
        event: 'wdl_success',
        trace_id,
        context: { latency_ms: latency, fen_hash: fen.substring(0, 10) }
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
            fen_hash: fen.substring(0, 10)
          }
        });
      } else {
        logger.log({
          level: 'error',
          event: 'wdl_error',
          trace_id,
          context: {
            error: error.message,
            latency_ms: latency,
            fen_hash: fen.substring(0, 10)
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
  const trace_id = correlationId || generateCorrelationId();
  const url = `${MICROSERVICE_URL}/top-moves?${querystring.stringify({ fen, n })}`;
  const startTime = Date.now();

  return axios
    .get<MicroserviceResponse<TopMoveData>>(url, {
      headers: {
        'x-api-key': apiKey,
        'x-trace-id': trace_id
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
          full_fen: fen,
          move_count: n,
          returned_moves: res.data.data.length
        }
      });

      // Additional logging for empty results
      if (res.data.data.length === 0) {
        logger.log({
          level: 'warn',
          event: 'top_moves_empty_result',
          trace_id,
          context: {
            full_fen: fen,
            expected_moves: n,
            microservice_response: res.data
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
            full_fen: fen
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
            full_fen: fen,
            status: error.response?.status,
            response_data: error.response?.data
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
  const trace_id = correlationId || generateCorrelationId();
  const url = `${MICROSERVICE_URL}/move-analysis?${querystring.stringify({ fen, move })}`;
  const startTime = Date.now();

  return axios
    .get<MicroserviceResponse<MoveAnalysisData>>(url, {
      headers: {
        'x-api-key': apiKey,
        'x-trace-id': trace_id
      },
      timeout: 5000,
    })
    .then((res) => {
      const latency = Date.now() - startTime;
      logger.log({
        level: 'debug',
        event: 'move_analysis_success',
        trace_id,
        context: { latency_ms: latency, fen_hash: fen.substring(0, 10), move }
      });
      return res.data.data;
    })
    .then(validate<MoveAnalysisData>(MoveAnalysisSchema))
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
            move
          }
        });
      }

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