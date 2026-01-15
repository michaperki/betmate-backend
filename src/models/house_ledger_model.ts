import mongoose, { Schema } from 'mongoose';

const HouseLedgerSchema = new Schema({
  game_id: { type: Schema.Types.ObjectId, required: true, ref: 'Chess', index: true },
  move_number: { type: Number, required: true },
  amount: { type: Number, required: true, min: 0 },
  currency: { type: String, enum: ['BET', 'USDT'], default: 'USDT' },
  rake_rate: { type: Number, required: true, min: 0, max: 1 },
  total_pool_real: { type: Number, required: true, min: 0 },
  note: { type: String },
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  toJSON: {
    transform: (doc, { __v, ...ledger }) => ledger,
  },
});

HouseLedgerSchema.index({ game_id: 1, move_number: 1 });

const HouseLedgerModel = mongoose.model('HouseLedger', HouseLedgerSchema);

export default HouseLedgerModel;

