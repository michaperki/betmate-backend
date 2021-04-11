import mongoose, { Schema } from 'mongoose';
import { IChess } from 'types/models';
import { CHESS_START, GameStatus } from '../helpers/constants';

const ChessSchema = new Schema({
  state: { type: String, default: CHESS_START },
  complete: { type: Boolean, default: false },
  game_status: { type: String, default: GameStatus.NOT_STARTED },
  players: [{ type: String, required: true }],
  move_hist: { type: [String], default: [] },
  wagers: [{ type: Schema.Types.ObjectId, ref: 'Wager' }],
  times: { type: [Number], default: [600, 600] },
});

const ChessModel = mongoose.model<IChess>('Chess', ChessSchema);

export default ChessModel;
