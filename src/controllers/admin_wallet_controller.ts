import { RequestHandler } from 'express';
import Deposit from '../models/deposit_model';
import Withdrawal from '../models/withdrawal_model';
import { writeAuditEntry } from '../utils/admin_audit';

export const listDeposits: RequestHandler = async (req, res) => {
  try {
    const limit = Math.max(1, Math.min(200, Number(req.query.limit) || 50));
    const skip = Math.max(0, Number(req.query.skip) || 0);
    const status = String(req.query.status || '').toLowerCase();
    const sinceISO = String(req.query.since || '');
    const q: any = {};
    if (status && ['pending', 'confirmed', 'failed'].includes(status)) q.status = status;
    if (sinceISO) {
      const d = new Date(sinceISO);
      if (!isNaN(d.getTime())) q.created_at = { $gte: d };
    }
    const rows = await Deposit.find(q).sort({ created_at: -1 }).skip(skip).limit(limit).lean();
    // Return safe fields only
    const data = (rows || []).map((r: any) => ({
      _id: String(r._id),
      user_id: String(r.user_id),
      amount: r.amount,
      currency: r.currency,
      provider: r.provider,
      provider_ref: r.provider_ref,
      status: r.status,
      created_at: r.created_at,
      metadata: r.metadata,
    }));
    res.status(200).json({ deposits: data });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Failed to list deposits' });
  }
};

export const clearStaleInvoices: RequestHandler = async (req, res) => {
  try {
    if (process.env.NODE_ENV === 'production' && String(process.env.ENABLE_DANGER_ZONE || 'false').toLowerCase() !== 'true') {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const minutes = Math.max(1, Math.min(1440, Number(req.body?.olderThanMinutes || 60)));
    const cutoff = new Date(Date.now() - minutes * 60 * 1000);
    const result = await Deposit.updateMany({ status: 'pending', created_at: { $lt: cutoff } }, { $set: { status: 'failed' } });
    const updated = (result as any)?.modifiedCount ?? 0;
    try { await writeAuditEntry(req as any, 'billing.clear_stale_invoices', undefined, `updated=${updated}`, { olderThanMinutes: minutes }); } catch {}
    res.status(200).json({ ok: true, updated, olderThanMinutes: minutes });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Failed to clear stale invoices' });
  }
};

export const getDailyPaymentVolume: RequestHandler = async (req, res) => {
  try {
    const days = Math.max(1, Math.min(30, Number(req.query.days) || 7));
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const mkPipeline = (dateField: string, statusField?: string) => ([
      { $match: { [dateField]: { $gte: since } } },
      { $group: {
        _id: {
          y: { $year: `$${dateField}` },
          m: { $month: `$${dateField}` },
          d: { $dayOfMonth: `$${dateField}` },
          ...(statusField ? { s: `$${statusField}` } : {}),
        },
        c: { $sum: 1 },
      } },
      { $project: { date: { $dateFromParts: { year: '$_id.y', month: '$_id.m', day: '$_id.d' } }, status: '$_id.s', count: '$c', _id: 0 } },
      { $sort: { date: 1 } },
    ]);

    const [dep, wdl] = await Promise.all([
      (Deposit as any).aggregate(mkPipeline('created_at', 'status')),
      (Withdrawal as any).aggregate(mkPipeline('created_at', 'status')),
    ]);

    res.status(200).json({ deposits: dep, withdrawals: wdl, since: since.toISOString(), days });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Failed to compute daily volume' });
  }
};

export default { listDeposits, clearStaleInvoices, getDailyPaymentVolume };
