/* eslint-disable func-names */
import mongoose, { Document, Schema } from 'mongoose';
import { CHESS_START } from 'helpers/constants';
import { isGameComplete, isGameStatus } from 'helpers/validation/chess';
import microservice from 'services/microservice';
import { WDLData } from 'types/microservice';
import { Chess } from 'chess.js';
import { Chess as ChessType, ChessDoc, GameStatus } from 'types/models/chess';
import {
  MovesSchema, OddsSchema, PlayerSchema, PoolWagerSchema,
} from './helper_schemas';

const ChessSchema = new Schema({
  state: {
    type: String,
    default: CHESS_START,
    validate: {
      validator: (fen: string) => Chess().validate_fen(fen).valid,
      message: (props) => Chess().validate_fen(props.value).error,
    },
  },
  time_format: { type: String, default: '300+0', immutable: true },
  complete: { type: Boolean, default: false },
  game_status: {
    type: String,
    default: GameStatus.NOT_STARTED,
    validate: {
      validator: isGameStatus,
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
  move_hist: { type: [MovesSchema], default: [] },
  time_white: { type: Number, min: 0, default: 600 },
  time_black: { type: Number, min: 0, default: 600 },
  odds: {
    type: OddsSchema,
    default: { white_win: 0.0, draw: 0.0, black_win: 0.0 } as WDLData,
  },
  pool_wagers: {
    move: { type: PoolWagerSchema, default: { options: [], wagers: [] } },
  },
}, {
  toJSON: {
    transform: (doc, { __v, ...chess }) => chess,
  },
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
});

/**
 * Get initial WDL odds and move options of game from microservice.
 */
ChessSchema.pre('save', async function (next) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const doc: Partial<ChessType> & Document = this;
    if (this.isNew) {
      const dataPromise = microservice.getWDL(doc.state ?? CHESS_START, doc.time_white ?? 180, doc.time_black ?? 180);
      const moveOptionsPromise = microservice.getTopMoves(doc.state ?? CHESS_START, 3);
      const [data, moveOptions] = await Promise.all([dataPromise, moveOptionsPromise]);

      doc.odds = data ?? doc.odds;
      if (doc.pool_wagers) doc.pool_wagers.move.options = moveOptions ?? [];
    }
    doc.complete = isGameComplete(doc.game_status ?? GameStatus.NOT_STARTED);

    next();
  } catch (error) {
    next(error);
  }
});

const ChessModel = mongoose.model<ChessDoc>('Chess', ChessSchema);

export default ChessModel;
