import mongoose, { Schema } from 'mongoose';
import { Chess } from 'chess.js';
import { ChessDoc } from 'types/models';
import { CHESS_START, GameStatus } from 'helpers/constants';

const ChessSchema = new Schema({
  state: {
    type: String,
    default: CHESS_START,
    validate: {
      validator: (fen: string) => Chess().validate_fen(fen).valid,
      message: (props) => Chess().validate_fen(props.value).error,
    },
  },
  complete: { type: Boolean, default: false },
  game_status: {
    type: String,
    default: GameStatus.NOT_STARTED,
    validate: {
      validator: (status: string) => Object.values(GameStatus).includes(status as GameStatus),
      message: (props) => `Value "${props.value}" not in enum "GameStatus"`,
    },
  },
  player_white: { type: String, required: true }, // Should reference to id of player in future
  player_black: { type: String, required: true }, // Should reference to id of player in future
  move_hist: { type: [String], default: [] },
  wagers: [{ type: Schema.Types.ObjectId, ref: 'Wager' }],
  time_white: { type: Number, min: 0, default: 600 },
  time_black: { type: Number, min: 0, default: 600 },
});

const ChessModel = mongoose.model<ChessDoc>('Chess', ChessSchema);

export default ChessModel;
