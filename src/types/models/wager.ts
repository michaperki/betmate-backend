import { Document, Types } from 'mongoose';
import { GameStatus } from './chess';

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
  winning_pool_share: number,
  winnings: number,
  created_at: Date,
  updated_at: Date,
}

export interface WagerDoc extends Wager, Document {}

/* -------- Wager Processing Types -------- */

export interface ProcessedWager {
  _id: Types.ObjectId,
  better_id: Types.ObjectId,
  winnings: number,
  outcome: WagerOutcomes
}

  type WagerProcessorOutput = {
    processedWagers: ProcessedWager[],
    winningPoolShare?: number
  };

export type WagerProcessor = (wagers: WagerDoc[], correctWager: string) => WagerProcessorOutput;
export type WagerResults = Record<WagerOutcomes, Types.ObjectId[]>;
export type UserWinnings = Record<string, number>;
export type UserWagers = Record<string, WagerDoc[]>;
