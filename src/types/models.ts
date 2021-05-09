import { Document, Types } from 'mongoose';
import { WDLData } from './microservice';

export interface User {
  email: string,
  password: string,
  first_name?: string,
  last_name?: string,
  full_name?: string,
  account: number,
  wager_hist: string[],
}

export type CompareCallback = (err: Error, isMatch?: boolean) => void;
export interface UserDoc extends User, Document {
  wager_hist: Types.Array<string>,
  comparePassword: (password: string, callback: CompareCallback) => void
}

export enum GameStatus {
  NOT_STARTED = 'not_started',
  DRAW = 'draw',
  BLACK_WIN = 'black_win',
  WHITE_WIN = 'white_win',
  IN_PROGRESS = 'in_progress',
}

export type WagerWDL = GameStatus.WHITE_WIN | GameStatus.DRAW | GameStatus.BLACK_WIN;
export enum WagerStatus {
  PENDING = 'pending',
  WON = 'won',
  LOST = 'lost',
  CANCELLED = 'cancelled',
}

export type WagerOutcomes = Exclude<WagerStatus, WagerStatus.PENDING>;

export interface Wager {
  game_id: Types.ObjectId,
  better_id: Types.ObjectId,
  wdl: boolean,
  amount: number,
  odds: number,
  data: string,
  move_number: number,
  resolved: boolean,
  status: WagerStatus,
  created_at: Date,
  updated_at: Date,
}

export interface WagerDoc extends Wager, Document {}

export interface Player {
  name: string,
  elo: number
}

export interface Chess {
  state: string,
  complete: boolean,
  game_status: GameStatus,
  player_white: Player,
  player_black: Player,
  move_hist: string[],
  wagers: Types.ObjectId[],
  time_white: number,
  time_black: number,
  odds: WDLData,
  created_at: Date,
  updated_at: Date,
}

export interface ChessDoc extends Chess, Document {
  move_hist: Types.Array<string>,
  wagers: Types.Array<Types.ObjectId>
}
