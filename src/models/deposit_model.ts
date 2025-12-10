import mongoose, { Schema, Types } from 'mongoose';

export interface DepositDoc extends mongoose.Document {
  user_id: Types.ObjectId;
  amount: number;
  currency: string; // 'USDT' | 'USDC' | 'USD'
  provider: string; // 'coinbase' | 'circle' | 'manual'
  provider_ref?: string; // checkout id / session id / tx id
  status: 'pending' | 'confirmed' | 'failed';
  metadata?: Record<string, any>;
  created_at: Date;
  updated_at: Date;
}

const DepositSchema = new Schema<DepositDoc>({
  user_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  amount: { type: Number, required: true, min: 0 },
  currency: { type: String, required: true },
  provider: { type: String, required: true },
  provider_ref: { type: String },
  status: { type: String, enum: ['pending', 'confirmed', 'failed'], default: 'pending' },
  metadata: { type: Schema.Types.Mixed },
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

const DepositModel = mongoose.model<DepositDoc>('Deposit', DepositSchema);
export default DepositModel;

