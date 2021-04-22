import mongoose, { Schema } from 'mongoose';
import { WagerDoc } from 'types/models';

const WagerSchema = new Schema({
  game_id: { type: Schema.Types.ObjectId, required: true, ref: 'Chess' },
  better_id: { type: Schema.Types.ObjectId, required: true, ref: 'User' },
  wdl: { type: Boolean, required: true },
  amount: { type: Number, min: 0.01, required: true },
  odds: { type: Number, min: 1, required: true },
  data: { type: String, required: true },
  move_number: { type: Number, min: 0, required: true },
  resolved: { type: Boolean, default: false },
}, {
  toJSON: {
    transform: (doc, { __v, ...wager }) => wager,
  },
});

const WagerModel = mongoose.model<WagerDoc>('Wager', WagerSchema);

export default WagerModel;
