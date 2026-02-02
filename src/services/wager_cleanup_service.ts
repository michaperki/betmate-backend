import { Types } from 'mongoose';
import { Chess, Wager } from '../models';
import { WagerStatus } from '../types/models/wager';
import { userService } from '../services';
import { GameStatus } from '../types/models/chess';

/**
 * Sweep unresolved wagers for games that no longer exist or have been marked complete/aborted.
 * Cancels and refunds stakes appropriately (BET -> token_balance, USDT -> cash_balance).
 *
 * Scope:
 *  - WDL and move wagers
 *  - Arcade and Real modes
 *  - Game missing OR game.complete === true (ABORTED or otherwise finished)
 */
export async function cleanupOrphanAndFinishedWagers(): Promise<{ updated: number; inspected: number }> {
  // Fetch all unresolved wagers (both WDL and move), any mode
  const pending = await Wager.find({ resolved: false })
    .select('_id better_id amount currency game_id')
    .lean();
  const inspected = pending.length;
  if (!inspected) return { updated: 0, inspected };

  // Fetch games referenced by these wagers
  const gameIds = Array.from(new Set(pending.map((w: any) => String(w.game_id)).filter(Boolean)));
  const games = await Chess.find({ _id: { $in: gameIds.map((id) => Types.ObjectId(id)) } })
    .select('_id complete game_status')
    .lean();
  const gameInfo = new Map<string, { complete: boolean; status?: GameStatus }>();
  for (const g of games) gameInfo.set(String((g as any)._id), { complete: !!(g as any).complete, status: (g as any).game_status });

  let updated = 0;
  for (const w of pending) {
    try {
      const gid = String((w as any).game_id || '');
      const info = gameInfo.get(gid);
      const exists = !!info;
      const isDone = exists ? !!info!.complete : false;
      const isAborted = exists ? (info!.status === GameStatus.ABORTED) : false;

      // Orphan (no game) OR completed (including aborted)
      if (!exists || isDone || isAborted) {
        const stake = Math.max(0, Number((w as any).amount || 0));
        const currency = ((w as any).currency === 'USDT') ? 'USDT' : 'BET';
        const inc: any = (currency === 'USDT') ? { cash_balance: stake } : { token_balance: stake };

        if (stake > 0) {
          await userService.updateUserData((w as any).better_id, { $inc: inc });
          await userService.recordBalanceChange(
            (w as any).better_id,
            stake,
            !exists ? 'Wager cancelled (orphaned game)' : (isAborted ? 'Wager cancelled (game aborted)' : 'Wager cancelled (game finished)'),
            String((w as any)._id),
            'Wager',
            currency as any,
          );
        }

        await Wager.updateOne(
          { _id: (w as any)._id },
          { $set: { status: WagerStatus.CANCELLED, resolved: true } }
        );
        updated += 1;
      }
    } catch (_e) {
      // continue next
    }
  }
  return { updated, inspected };
}
