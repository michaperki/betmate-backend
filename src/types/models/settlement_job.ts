import { Document, Types } from 'mongoose';

export type SettlementType = 'critical_move' | 'wdl';

export interface SettlementJobDoc extends Document {
  _id: Types.ObjectId;
  job_id: string; // `${gameId}:${type}:${move_number||0}` for uniqueness
  game_id: Types.ObjectId;
  type: SettlementType;
  move_number?: number; // required for 'critical_move', 0 or undefined for 'wdl'
  status: 'pending' | 'running' | 'complete' | 'failed';
  attempt_count: number;
  lease_expires_at?: Date;
  last_error?: string;
  created_at: Date;
  updated_at: Date;
}

