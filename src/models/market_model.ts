import mongoose, { Schema } from 'mongoose';
import { MarketDoc } from '../types/models/market';

const MarketSchema = new Schema({
  game_id: { type: Schema.Types.ObjectId, ref: 'Chess', required: true, index: true },
  type: { type: String, enum: ['wdl'], required: true, default: 'wdl', index: true },
  q: {
    white: { type: Number, required: true, default: 0 },
    draw: { type: Number, required: true, default: 0 },
    black: { type: Number, required: true, default: 0 },
  },
  b: { type: Number, required: true, default: 500 },
  rake: { type: Number, required: true, default: 0.02 },
  status: { type: String, enum: ['open', 'locked', 'settled'], required: true, default: 'open' },
}, {
  toJSON: {
    transform: (doc, { __v, ...mkt }) => mkt,
  },
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
});

MarketSchema.index({ game_id: 1, type: 1 }, { unique: true });

const MarketModel = mongoose.model<MarketDoc>('Market', MarketSchema);

export default MarketModel;

