import { Schema } from 'mongoose';

export const PlayerSchema = new Schema({
  name: { type: String, required: true },
  elo: { type: Number, required: true },
}, { _id: false });

export const OddsSchema = new Schema({
  white_win: {
    type: Number,
    required: true,
    min: 0,
    max: 1,
  },
  draw: {
    type: Number,
    required: true,
    min: 0,
    max: 1,
  },
  black_win: {
    type: Number,
    required: true,
    min: 0,
    max: 1,
  },
}, { _id: false });
