import mongoose, { Schema } from 'mongoose';

export interface InviteCodeDoc extends mongoose.Document {
  code: string;
  campaign: string;
  max_redemptions: number;
  redeemed_count: number;
  expires_at?: Date;
  active: boolean;
  grant_tokens?: number; // BET tokens (aka K Bits)
  grant_cash_usd?: number; // USD-equivalent for real wallet
  created_at: Date;
  updated_at: Date;
}

const InviteCodeSchema = new Schema<InviteCodeDoc>({
  code: { type: String, required: true, unique: true, index: true },
  campaign: { type: String, required: true, index: true },
  max_redemptions: { type: Number, required: true, min: 1, default: 1 },
  redeemed_count: { type: Number, required: true, min: 0, default: 0 },
  expires_at: { type: Date, default: undefined },
  active: { type: Boolean, default: true, index: true },
  grant_tokens: { type: Number, default: 0 },
  grant_cash_usd: { type: Number, default: 0 },
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

InviteCodeSchema.index({ campaign: 1, code: 1 }, { unique: true });

const InviteCodeModel = mongoose.model<InviteCodeDoc>('InviteCode', InviteCodeSchema);
export default InviteCodeModel;

