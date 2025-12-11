import { Document, Types } from 'mongoose';

export type MarketType = 'wdl';
export type MarketStatus = 'open' | 'locked' | 'settled';

export interface MarketDoc extends Document {
  _id: Types.ObjectId,
  game_id: Types.ObjectId,
  type: MarketType,
  q: { white: number, draw: number, black: number },
  b: number,
  rake: number,
  status: MarketStatus,
  created_at: Date,
  updated_at: Date,
}

