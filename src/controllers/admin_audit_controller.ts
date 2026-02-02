import { RequestHandler } from 'express';
import { AdminAudit } from '../models';

export const getAuditEntries: RequestHandler = async (req, res) => {
  try {
    const limit = Math.max(1, Math.min(200, Number(req.query.limit) || 50));
    const skip = Math.max(0, Number(req.query.skip) || 0);
    const actor = String(req.query.actor || '').trim();
    const action = String(req.query.action || '').trim();
    const since = String(req.query.since || '').trim();
    const query = String(req.query.q || '').trim();
    const filter: any = {};
    if (actor) filter.actor = actor;
    if (action) filter.action = action;
    if (since) {
      const d = new Date(since);
      if (!isNaN(d.getTime())) filter.ts = { $gte: d };
    }
    if (query) {
      const rx = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [ { actor: rx }, { action: rx }, { target: rx }, { details: rx } ];
    }
    const [rows, total] = await Promise.all([
      (AdminAudit as any).find(filter).sort({ ts: -1 }).limit(limit).skip(skip).lean(),
      (AdminAudit as any).countDocuments(filter),
    ]);
    return res.status(200).json({ entries: rows, total });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || 'Failed to load audit' });
  }
};

export default { getAuditEntries };
