import mongoose, { Schema } from 'mongoose';

// Raffle Draw Schema
const RaffleDrawSchema = new Schema({
  period: { 
    type: String, 
    enum: ['WEEKLY', 'MONTHLY'], 
    required: true 
  },
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
  cutoffDate: { type: Date, required: true },
  status: { 
    type: String, 
    enum: ['UPCOMING', 'ACTIVE', 'DRAWING', 'COMPLETED'], 
    default: 'UPCOMING' 
  },
  totalTickets: { type: Number, default: 0 },
  drawnAt: { type: Date, required: false },
}, {
  timestamps: true,
  toJSON: { virtuals: true }
});

// Ensure unique combination of period and startDate
RaffleDrawSchema.index({ period: 1, startDate: 1 }, { unique: true });

// Raffle Ticket Schema
const RaffleTicketSchema = new Schema({
  drawId: { type: Schema.Types.ObjectId, ref: 'RaffleDraw', required: true },
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  coinBalance: { type: Number, required: true }, // User's coin balance at cutoff
  ticketStart: { type: Number, required: true }, // Starting ticket number (inclusive)
  ticketEnd: { type: Number, required: true }, // Ending ticket number (inclusive)
}, {
  timestamps: true,
  toJSON: { virtuals: true }
});

// Ensure one ticket entry per user per draw
RaffleTicketSchema.index({ drawId: 1, userId: 1 }, { unique: true });
RaffleTicketSchema.index({ drawId: 1, ticketStart: 1, ticketEnd: 1 });

// Prize Schema
const PrizeSchema = new Schema({
  drawId: { type: Schema.Types.ObjectId, ref: 'RaffleDraw', required: true },
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  type: { 
    type: String, 
    enum: ['GIFT_CARD', 'BETMATE_CREDITS', 'MERCHANDISE'], 
    required: true 
  },
  value: { type: String, required: true }, // Prize value/description
  code: { type: String, required: false }, // Gift card code or other redemption info
  claimed: { type: Boolean, default: false },
  claimedAt: { type: Date, required: false },
}, {
  timestamps: true,
  toJSON: { virtuals: true }
});

// Export the models
export const RaffleDraw = mongoose.model('RaffleDraw', RaffleDrawSchema);
export const RaffleTicket = mongoose.model('RaffleTicket', RaffleTicketSchema);
export const Prize = mongoose.model('Prize', PrizeSchema);