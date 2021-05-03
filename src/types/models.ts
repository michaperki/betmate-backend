import { Document, Types } from 'mongoose';
import { GameStatus } from 'helpers/constants';

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

export type WagerWDL = GameStatus.WHITE_WIN | GameStatus.DRAW | GameStatus.BLACK_WIN;

export interface Wager {
  game_id: Types.ObjectId,
  better_id: Types.ObjectId,
  wdl: boolean,
  amount: number,
  odds: number,
  data: string,
  move_number: number,
  resolved: boolean,
  createdAt: Date,
  updatedAt: Date,
}

export interface WagerDoc extends Wager, Document {}

export interface Player {
  name: string,
  elo: number
}

export interface Chess {
  state: string,
  complete: boolean,
  game_status: string,
  player_white: Player,
  player_black: Player,
  move_hist: string[],
  wagers: Types.ObjectId[],
  time_white: number,
  time_black: number
  createdAt: Date,
  updatedAt: Date,
}

export interface ChessDoc extends Chess, Document {
  move_hist: Types.Array<string>,
  wagers: Types.Array<Types.ObjectId>
}
