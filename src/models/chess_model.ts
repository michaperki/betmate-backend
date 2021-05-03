import mongoose, { Schema } from 'mongoose';
import { Chess } from 'chess.js';
import { ChessDoc, GameStatus } from 'types/models';
import { CHESS_START } from 'helpers/constants';

const PlayerSchema = new Schema({
  name: { type: String, required: true },
  elo: { type: Number, required: true },
}, { _id: false });

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
  player_white: {
    type: PlayerSchema,
    required: true,
    immutable: true,
  },
  player_black: {
    type: PlayerSchema,
    required: true,
    immutable: true,
  },
  move_hist: { type: [String], default: [] },
  wagers: [{ type: Schema.Types.ObjectId, ref: 'Wager' }],
  time_white: { type: Number, min: 0, default: 600 },
  time_black: { type: Number, min: 0, default: 600 },
}, {
  toJSON: {
    transform: (doc, { __v, ...chess }) => chess,
  },
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
});

const ChessModel = mongoose.model<ChessDoc>('Chess', ChessSchema);

export default ChessModel;
