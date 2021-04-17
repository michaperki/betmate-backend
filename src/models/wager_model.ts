import mongoose, { Schema } from 'mongoose';
import { IWager } from '../types/models';

const WagerSchema = new Schema({
  game_id: { type: Schema.Types.ObjectId, required: true, ref: 'Chess' },
  bettor_id: { type: Schema.Types.ObjectId, required: true, ref: 'User' },
  wdl: { type: Boolean, required: true },
  amount: { type: Number, min: 0, required: true },
  odds: { type: Number, default: 0 },
  data: { type: String, required: true },
  move_number: { type: Number, required: true },
  resolved: { type: Boolean, default: false },
});

const WagerModel = mongoose.model<IWager>('Wager', WagerSchema);

export default WagerModel;
