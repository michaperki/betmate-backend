import { RequestHandler } from 'express';
import { Types } from 'mongoose';
import { Chess, Wager } from '../models';
import { WagerStatus } from '../types/models/wager';
import { userService } from '../services';

// Dev/Staging: mark PENDING Real WDL wagers as CANCELLED when their game is complete and older than N minutes.
// Also refunds the stake to the user's cash_balance and records a BalanceHistory item.
export const clearStaleWagers: RequestHandler = async (req, res) => {
  try {
    const minutes = Math.max(1, Math.min(1440, Number(req.body?.olderThanMinutes || 60)));
    const cutoff = new Date(Date.now() - minutes * 60 * 1000);

    // Find completed games
    const games = await Chess.find({ complete: true }).select('_id').lean();
    const gameIds = games.map((g: any) => g._id as Types.ObjectId);
    if (!gameIds.length) return res.status(200).json({ ok: true, updated: 0, olderThanMinutes: minutes });

    // Find stuck wagers
    const stuck = await Wager.find({
      wdl: true,
      mode: 'real',
      status: WagerStatus.PENDING,
      game_id: { $in: gameIds },
      created_at: { $lt: cutoff },
    }).select('_id better_id amount currency').lean();

    let updated = 0;
    for (const w of stuck) {
      try {
        // Refund stake to user's cash balance
        await userService.updateUserData((w as any).better_id, { $inc: { cash_balance: Math.max(0, Number((w as any).amount || 0)) } });
        await userService.recordBalanceChange((w as any).better_id, Math.max(0, Number((w as any).amount || 0)), 'Wager cancelled (stale)', String((w as any)._id), 'Wager', 'USDT');
        // Mark wager as cancelled/resolved
        await Wager.updateOne({ _id: (w as any)._id }, { $set: { status: WagerStatus.CANCELLED, resolved: true } });
        updated += 1;
      } catch (_e) {
        // Continue on individual failures
      }
    }

    return res.status(200).json({ ok: true, updated, olderThanMinutes: minutes });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || 'Failed to clear stale wagers' });
  }
};

export default { clearStaleWagers };

