import { Document } from 'mongoose';

/* -------- Main Types -------- */

export interface User {
  email: string,
  password: string,
  first_name?: string,
  last_name?: string,
  full_name?: string,
  account: number,
}

export type CompareCallback = (err: Error, isMatch?: boolean) => void;

export interface UserDoc extends User, Document {
  comparePassword: (password: string, callback: CompareCallback) => void
}
