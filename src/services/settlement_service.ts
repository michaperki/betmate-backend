import { Types } from 'mongoose';
import { SettlementJob } from '../models';
import { SettlementJobDoc, SettlementType } from '../types/models/settlement_job';

const DEFAULT_LEASE_MS = Number(process.env.SETTLEMENT_JOB_LEASE_MS || 10000);

function makeJobId(gameId: string, type: SettlementType, moveNumber?: number): string {
  const mv = type === 'critical_move' ? (Number(moveNumber || 0)) : 0;
  return `${gameId}:${type}:${mv}`;
}

async function acquire(
  gameId: string,
  type: SettlementType,
  moveNumber?: number,
): Promise<{ acquired: boolean; alreadyCompleted: boolean; job?: SettlementJobDoc }>
{
  const job_id = makeJobId(gameId, type, moveNumber);
  const now = new Date();
  const lease = new Date(now.getTime() + DEFAULT_LEASE_MS);

  const existing = await SettlementJob.findOne({ job_id });
  if (existing) {
    if (existing.status === 'complete') {
      return { acquired: false, alreadyCompleted: true, job: existing };
    }
    // Try to claim if pending/failed or lease expired
    const claimed = await SettlementJob.findOneAndUpdate(
      {
        job_id,
        $or: [
          { status: { $in: ['pending', 'failed'] } },
          { status: 'running', lease_expires_at: { $lte: now } },
        ],
      },
      {
        $set: { status: 'running', lease_expires_at: lease },
        $inc: { attempt_count: 1 },
      },
      { new: true },
    );
    if (claimed) return { acquired: true, alreadyCompleted: false, job: claimed };
    return { acquired: false, alreadyCompleted: false, job: existing };
  }

  // Create new job in running state
  try {
    const doc = await SettlementJob.create({
      job_id,
      game_id: Types.ObjectId(gameId),
      type,
      move_number: type === 'critical_move' ? Number(moveNumber || 0) : 0,
      status: 'running',
      lease_expires_at: lease,
      attempt_count: 1,
    } as any);
    return { acquired: true, alreadyCompleted: false, job: doc };
  } catch (_e) {
    // Race: someone else created it. Fall back to read + non-acquired
    const doc = await SettlementJob.findOne({ job_id });
    if (doc?.status === 'complete') return { acquired: false, alreadyCompleted: true, job: doc };
    return { acquired: false, alreadyCompleted: false, job: doc || undefined };
  }
}

async function complete(job: SettlementJobDoc): Promise<void> {
  await SettlementJob.updateOne({ _id: job._id }, { $set: { status: 'complete', lease_expires_at: undefined, last_error: undefined } });
}

async function fail(job: SettlementJobDoc, error: any): Promise<void> {
  const err = (error && error.message) ? error.message : String(error);
  await SettlementJob.updateOne({ _id: job._id }, { $set: { status: 'failed', last_error: err, lease_expires_at: undefined } });
}

export const settlementService = { acquire, complete, fail, makeJobId };
export default settlementService;

