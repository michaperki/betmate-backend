import mongoose, { Schema } from 'mongoose';
import { ChessDoc } from 'types/models';
import { CHESS_START, GameStatus } from '../helpers/constants';

const ChessSchema = new Schema({
  state: { type: String, default: CHESS_START },
  complete: { type: Boolean, default: false },
  game_status: { type: String, default: GameStatus.NOT_STARTED },
  player_white: { type: String, required: true },
  player_black: { type: String, required: true },
  move_hist: { type: [String], default: [] },
  wagers: [{ type: Schema.Types.ObjectId, ref: 'Wager' }],
  time_white: { type: Number, default: 600 },
  time_black: { type: Number, default: 600 },
});

const ChessModel = mongoose.model<ChessDoc>('Chess', ChessSchema);

export default ChessModel;
