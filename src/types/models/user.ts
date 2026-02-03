import mongoose, { Document } from 'mongoose';
// Bot support removed; keep BotConfig shape with a loose persona type

/* -------- Main Types -------- */

export enum UserRole {
  USER = 'user',
  STREAMER = 'streamer',
  ADMIN = 'admin',
}

export type CompareCallback = (err: Error, isMatch?: boolean) => void;

// Bot configuration
export interface BotConfig {
  persona: string;
  riskFactor: number; // 0-1 scale determining how much of allowance to bet
  maxBankroll: number; // Maximum tokens this bot can hold
  minWagerAmount: number; // Minimum wager amount
  maxWagerAmount: number; // Maximum wager amount per bet
  emptyBarThreshold: number; // Seconds to wait (for LATE_JOINER)
}

export interface UserDoc extends Document {
  _id: mongoose.Types.ObjectId,
  email: string,
  password: string,
  first_name: string,
  last_name: string,
  full_name: string,
  account: number,
  token_balance?: number,
  cash_balance?: number,
  onboarding_version_seen?: number,
  role?: UserRole,
  is_bot: boolean,
  botConfig?: BotConfig,
  email_verified?: boolean,
  verification_token?: string,
  verification_token_expires?: Date,
  magic_login_token?: string,
  magic_login_expires?: Date,
  magic_login_used_at?: Date,
  isNew: boolean,
  isModified: (path: string) => boolean,
  comparePassword: (password: string, callback: CompareCallback) => void
}

export interface BalanceHistoryDoc extends Document {
  user_id: mongoose.Types.ObjectId;
  amount: number;
  balance: number;
  reason: string;
  reference_id?: mongoose.Types.ObjectId;
  reference_type?: string;
  created_at: Date;
  updated_at: Date;
}
