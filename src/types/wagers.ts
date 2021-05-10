import { Types } from 'mongoose';
import { WagerDoc, WagerOutcomes } from 'types/models';

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
