import { Document, Types } from 'mongoose';
import { GameStatus } from '../helpers/constants';

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
}

export interface WagerDoc extends Wager, Document {}

export interface Chess {
  state: string,
  complete: boolean,
  game_status: string,
  player_white: string,
  player_black: string,
  move_hist: string[],
  wagers: Types.ObjectId[],
  time_white: number,
  time_black: number
}

export interface ChessDoc extends Chess, Document {
  move_hist: Types.Array<string>,
  wagers: Types.Array<Types.ObjectId>,
}
