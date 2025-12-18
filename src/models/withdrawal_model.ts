import mongoose, { Schema, Types } from 'mongoose';

export type WithdrawalStatus = 'requested' | 'approved' | 'rejected' | 'processing' | 'paid' | 'failed' | 'cancelled';

export interface WithdrawalDoc extends mongoose.Document {
  user_id: Types.ObjectId;
  amount: number; // USD-equivalent
  currency: string; // e.g., USDTTRC20 | USDTBEP20 | USDTERC20 | USDC
  address: string; // destination address
  status: WithdrawalStatus;
  provider?: string; // 'nowpayments' | 'manual' | ...
  provider_ref?: string; // payout id
  admin_notes?: string;
  metadata?: Record<string, any>;
  created_at: Date;
  updated_at: Date;
}

const WithdrawalSchema = new Schema<WithdrawalDoc>({
  user_id: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  amount: { type: Number, required: true, min: 0 },
  currency: { type: String, required: true },
  address: { type: String, required: true },
  status: { type: String, enum: ['requested', 'approved', 'rejected', 'processing', 'paid', 'failed', 'cancelled'], default: 'requested', index: true },
  provider: { type: String },
  provider_ref: { type: String },
  admin_notes: { type: String },
  metadata: { type: Schema.Types.Mixed },
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

const WithdrawalModel = mongoose.model<WithdrawalDoc>('Withdrawal', WithdrawalSchema);
export default WithdrawalModel;

