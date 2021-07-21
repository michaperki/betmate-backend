import { Schema, model, Types } from 'mongoose';
import { LeaderboardDoc } from 'types/models/leaderboard';

const RankSchema = new Schema({
  user_id: Types.ObjectId,
  user_name: String,
  rank: Number,
  winnings: Number,
}, { _id: false });

const LeaderboardSchema = new Schema({
  rankings: { type: [RankSchema], required: true },
  user_ranks: { type: Map, of: RankSchema, required: true },
  rankings_size: { type: Number, required: true },
}, {
  toJSON: {
    transform: (doc, { __v, ...board }) => board,
  },
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
});

const LeaderboardModel = model<LeaderboardDoc>('Leaderboard', LeaderboardSchema);

export default LeaderboardModel;
