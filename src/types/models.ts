import mongoose from 'mongoose';
import { Move } from 'chess.js';
import { GameStatus } from '../helpers/constants';

export interface IUserBase extends mongoose.Document {
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

export interface IResource extends mongoose.Document {
  title: string,
  description: string,
  value: number,
  date_resource_created: Date | number,
  child_resources?: any
}

export type WagerWDL = GameStatus.WHITE_WIN | GameStatus.DRAW | GameStatus.BLACK_WIN;
export type WagerMove = [Move, number, boolean];

export interface IWager extends mongoose.Document {
  game_id: mongoose.Types.ObjectId,
  bettor_id: mongoose.Types.ObjectId,
  wdl: boolean,
  amount: number,
  odds: number,
  data: WagerWDL | WagerMove,
  resolved: boolean,
}

export interface IChess extends mongoose.Document {
  state: string,
  completed: boolean,
  game_status: string,
  players: [string, string],
  move_hist: string[],
  wagers: mongoose.Types.ObjectId[],
  times: [number, number]
}
