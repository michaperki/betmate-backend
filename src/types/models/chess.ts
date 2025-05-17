import { Document, Types } from 'mongoose';
import { PartialWithRequired } from '../../types';
import { WDLData } from '../../types/microservice';

/* -------- Helper Types -------- */

export enum GameStatus {
  NOT_STARTED = 'not_started',
  DRAW = 'draw',
  BLACK_WIN = 'black_win',
  WHITE_WIN = 'white_win',
  IN_PROGRESS = 'in_progress',
  ABORTED = 'aborted',
}

export enum GameSource {
  STATIC = 'static',
  LOOP = 'loop',
  USER = 'user',
  STREAMER = 'streamer',
}

export interface Player {
  name: string,
  elo: number
}

export interface MoveData {
  san: string
  to: string
  from: string
  time: number
  is_white: boolean
}

export interface AnonMoveWager {
  data: string
  amount: number
}

export interface PoolWagerState {
  options: Types.Array<string>
  wagers: Types.Array<AnonMoveWager>
}

/* -------- Main Types -------- */

export interface ChessDoc extends Document {
  state: string,
  time_format: string,
  complete: boolean,
  source: GameSource,
  game_status: GameStatus,
  player_white: Player,
  player_black: Player,
  move_hist: Types.Array<MoveData>,
  time_white: number,
  time_black: number,
  odds: WDLData,
  pool_wagers: {
    move: PoolWagerState
  },
  created_at: Date,
  updated_at: Date,
}

export type CreateChessQuery = PartialWithRequired<ChessDoc, 'player_black' | 'player_white' | 'source'>;
