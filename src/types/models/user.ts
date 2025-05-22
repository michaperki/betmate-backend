import { Document } from 'mongoose';
import { BotPersona } from '../../agents/seedBot';

/* -------- Main Types -------- */

export enum UserRole {
  USER = 'user',
  STREAMER = 'streamer',
  ADMIN = 'admin',
}

export type CompareCallback = (err: Error, isMatch?: boolean) => void;

// Bot configuration
export interface BotConfig {
  persona: BotPersona;
  riskFactor: number; // 0-1 scale determining how much of allowance to bet
  maxBankroll: number; // Maximum tokens this bot can hold
  minWagerAmount: number; // Minimum wager amount
  maxWagerAmount: number; // Maximum wager amount per bet
  emptyBarThreshold: number; // Seconds to wait (for LATE_JOINER)
}

export interface UserDoc extends Document {
  email: string,
  password: string,
  first_name: string,
  last_name: string,
  full_name: string,
  account: number,
  role?: UserRole,
  is_bot: boolean,
  botConfig?: BotConfig,
  comparePassword: (password: string, callback: CompareCallback) => void
}
