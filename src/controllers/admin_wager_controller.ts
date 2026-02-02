import { RequestHandler } from 'express';
import { Types } from 'mongoose';
import { Chess, Wager } from '../models';
import { WagerStatus } from '../types/models/wager';
import { userService } from '../services';
import { writeAuditEntry } from '../utils/admin_audit';

// Dev/Staging: mark PENDING Real WDL wagers as CANCELLED when their game is complete and older than N minutes.
// Also refunds the stake to the user's cash_balance and records a BalanceHistory item.
export const clearStaleWagers: RequestHandler = async (req, res) => {
  try {
    if (process.env.NODE_ENV === 'production' && String(process.env.ENABLE_DANGER_ZONE || 'false').toLowerCase() !== 'true') {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const minutes = Math.max(1, Math.min(1440, Number(req.body?.olderThanMinutes || 60)));
    const cutoff = new Date(Date.now() - minutes * 60 * 1000);

    // Find completed games
    const games = await Chess.find({ complete: true }).select('_id').lean();
    const gameIds = games.map((g: any) => g._id as Types.ObjectId);
    if (!gameIds.length) return res.status(200).json({ ok: true, updated: 0, olderThanMinutes: minutes });

    // Find stuck wagers (completed games)
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

    // Orphaned wagers: unresolved wagers whose game doc is missing (older than cutoff)
    const orphanCandidates = await Wager.find({
      wdl: true,
      mode: 'real',
      status: WagerStatus.PENDING,
      created_at: { $lt: cutoff },
    }).select('_id better_id amount currency game_id').lean();

    if (orphanCandidates.length) {
      const orphanGameIds = Array.from(new Set(orphanCandidates.map((w: any) => String(w.game_id)).filter(Boolean)));
      const present = await Chess.find({ _id: { $in: orphanGameIds.map((id) => Types.ObjectId(id)) } }).select('_id').lean();
      const presentSet = new Set<string>(present.map((g: any) => String(g._id)));
      for (const w of orphanCandidates) {
        const gid = String((w as any).game_id);
        if (!gid || presentSet.has(gid)) continue; // not orphan
        try {
          await userService.updateUserData((w as any).better_id, { $inc: { cash_balance: Math.max(0, Number((w as any).amount || 0)) } });
          await userService.recordBalanceChange((w as any).better_id, Math.max(0, Number((w as any).amount || 0)), 'Wager cancelled (orphaned game)', String((w as any)._id), 'Wager', 'USDT');
          await Wager.updateOne({ _id: (w as any)._id }, { $set: { status: WagerStatus.CANCELLED, resolved: true } });
          updated += 1;
        } catch (_e) {}
      }
    }

    try { await writeAuditEntry(req as any, 'wager.clear_stale_wagers', undefined, `updated=${updated}`, { olderThanMinutes: minutes }); } catch {}
    return res.status(200).json({ ok: true, updated, olderThanMinutes: minutes });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || 'Failed to clear stale wagers' });
  }
};

export default { clearStaleWagers };
