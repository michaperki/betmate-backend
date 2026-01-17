import { Types } from 'mongoose';
import { Chess, Wager } from '../models';
import { WagerStatus } from '../types/models/wager';
import { userService } from '../services';

/**
 * Cancel unresolved Real WDL wagers whose game is either missing or completed (ABORTED/finished).
 * Refunds stake to user's cash_balance and marks wagers as CANCELLED/resolved.
 * Intended for startup housekeeping in dev/staging and resilient production restarts.
 */
export async function cleanupOrphanAndFinishedWagers(): Promise<{ updated: number; inspected: number }> {
  // Fetch unresolved Real WDL wagers
  const pending = await Wager.find({ wdl: true, mode: 'real', resolved: false })
    .select('_id better_id amount currency game_id')
    .lean();
  const inspected = pending.length;
  if (!inspected) return { updated: 0, inspected };

  // Fetch games relevant to these wagers
  const gameIds = Array.from(new Set(pending.map((w: any) => String(w.game_id)).filter(Boolean)));
  const games = await Chess.find({ _id: { $in: gameIds.map((id) => Types.ObjectId(id)) } })
    .select('_id complete')
    .lean();
  const gameComplete = new Map<string, boolean>();
  for (const g of games) gameComplete.set(String((g as any)._id), !!(g as any).complete);

  let updated = 0;
  for (const w of pending) {
    try {
      const gid = String((w as any).game_id);
      const exists = gameComplete.has(gid);
      const isComplete = exists ? !!gameComplete.get(gid) : false;
      // Orphan (no game doc) or finished game
      if (!exists || isComplete) {
        const stake = Math.max(0, Number((w as any).amount || 0));
        // Refund only for Real wagers (currency should be USDT); safeguard regardless
        await userService.updateUserData((w as any).better_id, { $inc: { cash_balance: stake } });
        await userService.recordBalanceChange(
          (w as any).better_id,
          stake,
          !exists ? 'Wager cancelled (orphaned game)' : 'Wager cancelled (game aborted)',
          String((w as any)._id),
          'Wager',
          'USDT'
        );
        await Wager.updateOne({ _id: (w as any)._id }, { $set: { status: WagerStatus.CANCELLED, resolved: true } });
        updated += 1;
      }
    } catch (_e) {
      // continue next
    }
  }
  return { updated, inspected };
}

