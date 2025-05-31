import mongoose, { Schema, Document } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

export interface RefreshTokenDoc extends Document {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  token: string;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
  isExpired: boolean;
  isValid: boolean;
}

const RefreshTokenSchema = new Schema({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  token: {
    type: String,
    required: true,
    default: () => uuidv4(),
    unique: true,
    index: true
  },
  expiresAt: {
    type: Date,
    required: true,
    default: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days from now
  }
}, {
  timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' }
});

// Virtual property to check if token is expired
RefreshTokenSchema.virtual('isExpired').get(function (this: RefreshTokenDoc) {
  return Date.now() > this.expiresAt.getTime();
});

// Virtual property to check if token is valid (not expired)
RefreshTokenSchema.virtual('isValid').get(function (this: RefreshTokenDoc) {
  return !this.isExpired;
});

// Create index for faster queries and automatic cleanup
RefreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Index for quick user token lookup
RefreshTokenSchema.index({ userId: 1, expiresAt: 1 });

const RefreshTokenModel = mongoose.model<RefreshTokenDoc>('RefreshToken', RefreshTokenSchema);

export default RefreshTokenModel;