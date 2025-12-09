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

const BalanceHistoryModel = mongoose.model<BalanceHistoryDoc>('BalanceHistory', BalanceHistorySchema);

export default BalanceHistoryModel;
