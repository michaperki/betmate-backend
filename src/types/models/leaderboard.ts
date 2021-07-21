import { Document, Types } from 'mongoose';

export interface Rank {
  user_id: Types.ObjectId
  user_name: string
  rank: number
  winnings: number
}

export interface LeaderboardDoc extends Document {
  rankings: Types.Array<Rank>
  user_ranks: Types.Map<Rank>
  rankings_size: number
  created_at: Date
  updated_at: Date
}

export interface LeaderboardSection {
  _id: Types.ObjectId
  rankings: Rank[]
  rankings_size: number
}
