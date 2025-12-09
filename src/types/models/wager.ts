import { Document, Types } from 'mongoose';
import { PartialWithRequired } from '../../types';
import { ChessDoc, GameStatus } from './chess';
import { UserDoc } from './user';

/* -------- Helper Types -------- */

export type WagerWDL = GameStatus.WHITE_WIN | GameStatus.DRAW | GameStatus.BLACK_WIN;

export enum WagerStatus {
  PENDING = 'pending',
  WON = 'won',
  LOST = 'lost',
  CANCELLED = 'cancelled',
}

export type WagerOutcomes = Exclude<WagerStatus, WagerStatus.PENDING>;

/* -------- Main Types -------- */

export interface WagerDoc extends Document {
  _id: Types.ObjectId,
  game_id: Types.ObjectId,
  better_id: Types.ObjectId,
  wdl: boolean,
  amount: number,
  odds: number,
  data: string,
  move_number: number,
  resolved: boolean,
  status: WagerStatus,
  winning_pool_share: number,
  winnings: number,
  created_at: Date,
  updated_at: Date,
  is_bot?: boolean,
  mode?: 'arcade' | 'real',
  currency?: 'BET' | 'USDT',
  pricing_model_version?: string,
}

export interface PopulatedWagerDoc extends Omit<WagerDoc, 'better_id' | 'game_id'> {
  game_id: ChessDoc
  better_id: UserDoc
}

export type CreateWagerQuery = PartialWithRequired<WagerDoc, 'game_id' | 'better_id' | 'wdl' | 'amount' | 'odds' | 'data' | 'move_number'> & { skip_game_check?: boolean };

/* -------- Wager Processing Types -------- */

export interface ProcessedWager {
  _id: Types.ObjectId,
  better_id: Types.ObjectId,
  winnings: number,
  outcome: WagerOutcomes,
  mode?: 'arcade' | 'real',
  currency?: 'BET' | 'USDT',
  applied_share?: number,
}

  type WagerProcessorOutput = {
    processedWagers: ProcessedWager[],
    winningPoolShare?: number
  };

export type WagerProcessor = (wagers: WagerDoc[], correctWager: string) => WagerProcessorOutput;
export type WagerResults = Record<WagerOutcomes, Types.ObjectId[]>;
export type UserWinnings = Record<string, number>;
export type UserWagers = Record<string, WagerDoc[]>;
