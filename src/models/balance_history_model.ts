import mongoose, { Schema } from 'mongoose';
import { BalanceHistoryDoc } from '../types/models/user';

const BalanceHistorySchema = new Schema({
  user_id: {
    type: Schema.Types.ObjectId,
    required: true,
    ref: 'User',
    index: true
  },
  amount: { type: Number, required: true },
  balance: { type: Number, required: true },
  currency: { type: String, enum: ['BET', 'USDT'], default: 'BET' },
  reason: { type: String, required: true },
  reference_id: { type: Schema.Types.ObjectId },
  reference_type: { type: String },
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  toJSON: {
    transform: (doc, { __v, ...balanceHistory }) => balanceHistory,
  },
});

// Prevent duplicate ledger entries for the same reference (idempotency on retries)
// Sparse so documents without a reference_id are not uniquely constrained.
BalanceHistorySchema.index(
  { user_id: 1, reference_id: 1, reference_type: 1, reason: 1, currency: 1 },
  { unique: true, sparse: true, name: 'uniq_ledger_by_reference' }
);

const BalanceHistoryModel = mongoose.model<BalanceHistoryDoc>('BalanceHistory', BalanceHistorySchema);

export default BalanceHistoryModel;
