import { Document } from 'mongoose';

/* -------- Main Types -------- */

export enum UserRole {
  USER = 'user',
  STREAMER = 'streamer',
  ADMIN = 'admin',
}

export type CompareCallback = (err: Error, isMatch?: boolean) => void;

export interface UserDoc extends Document {
  email: string,
  password: string,
  first_name: string,
  last_name: string,
  full_name: string,
  account: number,
  role?: UserRole
  comparePassword: (password: string, callback: CompareCallback) => void
}
