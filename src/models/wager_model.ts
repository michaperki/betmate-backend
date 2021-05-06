import { isWagerResolved, isWagerStatus } from 'helpers/validation/wagers';
import mongoose, { Document, Schema } from 'mongoose';
import { WagerDoc, WagerStatus, Wager as WagerType } from 'types/models';

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
}, {
  toJSON: {
    transform: (doc, { __v, ...wager }) => wager,
  },
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
});

// eslint-disable-next-line func-names
WagerSchema.pre('save', function (next) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const doc: Partial<WagerType> & Document = this;
    doc.resolved = isWagerResolved(doc.status ?? WagerStatus.PENDING);
    next();
  } catch (error) {
    next(error);
  }
});

const WagerModel = mongoose.model<WagerDoc>('Wager', WagerSchema);

export default WagerModel;
