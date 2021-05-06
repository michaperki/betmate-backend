import { Schema } from 'mongoose';
import { WDLData } from 'types/microservice';
import { Player } from 'types/models';

export const PlayerSchema = new Schema<Player>({
  name: { type: String, required: true },
  elo: { type: Number, required: true },
}, { _id: false });

export const OddsSchema = new Schema<WDLData>({
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
