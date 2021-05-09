import { Types } from 'mongoose';
import { WagerDoc, WagerOutcomes } from 'types/models';

export interface ProcessedWager {
  _id: Types.ObjectId,
  better_id: Types.ObjectId,
  winnings: number,
  outcome: WagerOutcomes
}

export type WagerProcessor = (wagers: WagerDoc[], correctWager: string) => ProcessedWager[];
