import { RequestHandler } from 'express';
import Deposit from '../models/deposit_model';

export const listDeposits: RequestHandler = async (req, res) => {
  try {
    const limit = Math.max(1, Math.min(200, Number(req.query.limit) || 50));
    const status = String(req.query.status || '').toLowerCase();
    const sinceISO = String(req.query.since || '');
    const q: any = {};
    if (status && ['pending', 'confirmed', 'failed'].includes(status)) q.status = status;
    if (sinceISO) {
      const d = new Date(sinceISO);
      if (!isNaN(d.getTime())) q.created_at = { $gte: d };
    }
    const rows = await Deposit.find(q).sort({ created_at: -1 }).limit(limit).lean();
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
    const minutes = Math.max(1, Math.min(1440, Number(req.body?.olderThanMinutes || 60)));
    const cutoff = new Date(Date.now() - minutes * 60 * 1000);
    const result = await Deposit.updateMany({ status: 'pending', created_at: { $lt: cutoff } }, { $set: { status: 'failed' } });
    res.status(200).json({ ok: true, updated: (result as any)?.modifiedCount ?? 0, olderThanMinutes: minutes });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Failed to clear stale invoices' });
  }
};

export default { listDeposits, clearStaleInvoices };
