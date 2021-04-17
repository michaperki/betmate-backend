import { Document, Types } from 'mongoose';
import { Move } from 'chess.js';
import { GameStatus } from '../helpers/constants';

export interface IUserBase extends Document {
  email?: string,
  password?: string,
  first_name?: string,
  last_name?: string,
  full_name?: string,
  account?: number,
  wager_hist?: [string],
  resource?: any,
  message?: string,
  _message?: string,
}

export type CompareCallback = (err: Error, isMatch?: boolean) => void;
export interface IUser extends IUserBase {
  comparePassword: (password: string, callback: CompareCallback) => void
}

export interface IResource extends Document {
  title: string,
  description: string,
  value: number,
  date_resource_created: Date | number,
  child_resources?: any
}

export type WagerWDL = GameStatus.WHITE_WIN | GameStatus.DRAW | GameStatus.BLACK_WIN;
export type WagerMove = [Move, number, boolean];

export interface IWager extends Document {
  game_id: Types.ObjectId,
  bettor_id: Types.ObjectId,
  wdl: boolean,
  amount: number,
  odds: number,
  data: WagerWDL | WagerMove,
  resolved: boolean,
}

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
