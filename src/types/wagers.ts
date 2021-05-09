import { Types } from 'mongoose';
import { WagerDoc, WagerOutcomes } from 'types/models';

export interface ProcessedWager {
  _id: Types.ObjectId,
  better_id: Types.ObjectId,
  winnings: number,
  outcome: WagerOutcomes
  winning_pool_share?: number
}

export type WagerProcessor = (wagers: WagerDoc[], correctWager: string) => ProcessedWager[];
export type WagerResults = Record<WagerOutcomes, ProcessedWager[]>;
export type UserWinnings = Record<string, number>;
