import { Types } from 'mongoose';
import { HouseLedger } from '../models';

async function recordMoveRake(
  gameId: string | Types.ObjectId,
  moveNumber: number,
  totalRealPool: number,
  rakeRate: number,
  amount: number,
  note?: string,
) {
  try {
    const gid = typeof gameId === 'string' ? new Types.ObjectId(gameId) : gameId;
    // Persist best-effort; swallow errors so settlement is never blocked
    await (HouseLedger as any).create({
      game_id: gid,
      move_number: moveNumber,
      total_pool_real: totalRealPool,
      rake_rate: rakeRate,
      amount,
      currency: 'USDT',
      note,
    });
  } catch (_e) {
    // no-op
  }
}

const houseLedgerService = { recordMoveRake };
export default houseLedgerService;
