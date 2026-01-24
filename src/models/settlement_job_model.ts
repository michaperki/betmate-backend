import mongoose, { Schema } from 'mongoose';
import { SettlementJobDoc } from '../types/models/settlement_job';

const SettlementJobSchema = new Schema({
  job_id: { type: String, required: true, unique: true },
  game_id: { type: Schema.Types.ObjectId, required: true, ref: 'Chess', index: true },
  type: { type: String, enum: ['critical_move', 'wdl'], required: true, index: true },
  move_number: { type: Number, default: 0, index: true },
  status: { type: String, enum: ['pending', 'running', 'complete', 'failed'], default: 'pending', index: true },
  attempt_count: { type: Number, default: 0 },
  lease_expires_at: { type: Date, default: undefined },
  last_error: { type: String, default: undefined },
}, {
  toJSON: {
    transform: (doc, { __v, ...job }) => job,
  },
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
});

// Optional uniqueness on game+type+move_number via a synthetic job_id already enforced.
// Provide an additional helpful index for queries by game/type/move.
SettlementJobSchema.index({ game_id: 1, type: 1, move_number: 1 }, { unique: true, name: 'uniq_game_type_move' });

const SettlementJobModel = mongoose.model<SettlementJobDoc>('SettlementJob', SettlementJobSchema);

export default SettlementJobModel;

