

import mongoose, { Schema } from 'mongoose';
import { IWager } from 'types/models';

const WagerSchema = new Schema({
    game_id: { type: Schema.Types.ObjectId, required: true },
    data: { type: String, required: true },
    resolved: { type: Boolean, default: false },
    bettors: { type: [String], default: [] }
});

const WagerModel = mongoose.model<IWager>('Wager', WagerSchema);

export default WagerModel;
