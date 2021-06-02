/* eslint-disable func-names */
/* eslint-disable @typescript-eslint/no-this-alias */
import { isWagerResolved, isWagerStatus } from 'helpers/validation/wagers';
import mongoose, { Document, Schema } from 'mongoose';
import { Wager as WagerType, WagerDoc, WagerStatus } from 'types/models/wager';

const WagerSchema = new Schema({
  game_id: {
    type: Schema.Types.ObjectId,
    required: true,
    immutable: true,
    ref: 'Chess',
  },
  better_id: {
    type: Schema.Types.ObjectId,
    required: true,
    immutable: true,
    ref: 'User',
  },
  wdl: { type: Boolean, required: true, immutable: true },
  amount: {
    type: Number,
    min: 0.01,
    required: true,
    immutable: true,
  },
  odds: {
    type: Number,
    min: 1,
    required: true,
    immutable: true,
  },
  data: { type: String, required: true, immutable: true },
  move_number: {
    type: Number,
    min: 0,
    required: true,
    immutable: true,
  },
  resolved: { type: Boolean, default: false },
  status: {
    type: String,
    default: WagerStatus.PENDING,
    validate: {
      validator: isWagerStatus,
      message: (props) => `Value "${props.value}" not in enum "WagerStatus"`,
    },
  },
  winning_pool_share: { type: Number, min: 1, default: 1 },
}, {
  toJSON: {
    transform: (doc, { __v, ...wager }) => wager,
  },
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
});

WagerSchema.pre('save', function (next) {
  try {
    const doc: Partial<WagerType> & Document = this;
    doc.resolved = isWagerResolved(doc.status ?? WagerStatus.PENDING);
    next();
  } catch (error) {
    next(error);
  }
});

WagerSchema.virtual('winnings').get(function () {
  const doc: WagerType & Document = this;
  switch (doc.status) {
    case WagerStatus.WON:
      return doc.wdl
        ? doc.amount * doc.odds
        : doc.amount * doc.winning_pool_share;
    case WagerStatus.CANCELLED:
      return doc.amount;
    case WagerStatus.LOST:
    case WagerStatus.PENDING:
    default:
      return 0;
  }
});

const WagerModel = mongoose.model<WagerDoc>('Wager', WagerSchema);

export default WagerModel;
