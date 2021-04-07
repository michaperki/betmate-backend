
import { CHESS_START } from '../helpers/constants';
import mongoose, { Schema } from 'mongoose';
import { IChess } from 'types/models';

const ChessSchema = new Schema({
    state: { type: String, default: CHESS_START },
    players: [{ type: String, required: true }],
    move_hist: { type: [String], default: [] },
    wagers: [{ type: Schema.Types.ObjectId, ref: 'Wager' }],
    times: { type: [Number], default: [600, 600] }
});

const ChessModel = mongoose.model<IChess>('Chess', ChessSchema);

export default ChessModel;
