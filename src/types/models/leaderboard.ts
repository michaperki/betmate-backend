import { Document, Types } from 'mongoose';

export interface Rank {
  user_id: Types.ObjectId
  user_name: string
  rank: number
  winnings: number
}

export interface LeaderboardDoc extends Document {
  rankings: Types.Array<Rank>
  created_at: Date
  updated_at: Date
}
