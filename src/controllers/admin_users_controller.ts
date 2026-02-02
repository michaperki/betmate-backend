import { RequestHandler } from 'express';
import { Types } from 'mongoose';
import { Users } from '../models';
import userService from '../services/user_service';
import { writeAuditEntry } from '../utils/admin_audit';

export const searchUsers: RequestHandler = async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    const limit = Math.max(1, Math.min(100, Number(req.query.limit) || 20));
    const skip = Math.max(0, Number(req.query.skip) || 0);

    const filter: any = {};
    if (q) {
      // search by email substring; if q looks like ObjectId, also allow exact _id match
      const arr: any[] = [{ email: { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } }];
      if (Types.ObjectId.isValid(q)) arr.push({ _id: Types.ObjectId(q) });
      filter.$or = arr;
    }

    const [rows, total] = await Promise.all([
      Users.find(filter).sort({ _id: -1 }).limit(limit).skip(skip).lean(),
      Users.countDocuments(filter),
    ]);

    const users = (rows || []).map((u: any) => ({
      _id: String(u._id),
      email: u.email,
      role: u.role,
      email_verified: !!u.email_verified,
      kyc_status: u.kyc_status || 'none',
      cash_balance: Number(u.cash_balance || 0),
      token_balance: Number(u.token_balance || 0),
      signup_ip: u.signup_ip,
      signup_user_agent: u.signup_user_agent,
      signup_device_id: u.signup_device_id,
    }));

    return res.status(200).json({ users, total });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || 'Search failed' });
  }
};

export const getUserLedger: RequestHandler = async (req, res) => {
  try {
    const id = String(req.params.id || '');
    if (!Types.ObjectId.isValid(id)) return res.status(400).json({ error: 'Invalid user id' });
    const limit = Math.max(1, Math.min(200, Number(req.query.limit) || 50));
    const skip = Math.max(0, Number(req.query.skip) || 0);
    const currency = String(req.query.currency || '').toUpperCase();
    const curr: any = (currency === 'USDT' || currency === 'BET') ? currency : undefined;
    const items = await userService.getUserBalanceHistory(id, limit, skip, curr);
    const mapped = (items || []).map((i: any) => ({
      amount: i.amount,
      reason: i.reason,
      reference_id: i.reference_id,
      reference_type: i.reference_type,
      currency: i.currency,
      created_at: i.created_at,
    }));
    return res.status(200).json({ items: mapped, total: mapped.length });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || 'Ledger fetch failed' });
  }
};

export const adjustBalance: RequestHandler = async (req, res) => {
  try {
    const id = String(req.params.id || '');
    const { currency, delta, reason } = (req.body || {}) as { currency?: 'USDT'|'BET'; delta?: number; reason?: string };
    if (!id) return res.status(400).json({ error: 'Missing user id' });
    if (currency !== 'USDT' && currency !== 'BET') return res.status(400).json({ error: 'Invalid currency' });
    const amount = Number(delta);
    if (!Number.isFinite(amount) || amount === 0) return res.status(400).json({ error: 'Invalid delta' });
    const why = (String(reason || '').trim()) || 'Admin adjustment';
    // Apply increment and record ledger
    if (currency === 'USDT') {
      await userService.updateUserData(id, { $inc: { cash_balance: amount } } as any);
    } else {
      await userService.updateUserData(id, { $inc: { token_balance: amount } } as any);
    }
    await userService.recordBalanceChange(id, amount, why, undefined, 'AdminAdjustment', currency);
    try { await writeAuditEntry(req as any, 'user.adjust_balance', id, `${currency}:${amount}`, { reason: why }); } catch {}
    return res.status(200).json({ ok: true });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || 'Adjust failed' });
  }
};

export const updateRole: RequestHandler = async (req, res) => {
  try {
    const id = String(req.params.id || '');
    const { role } = (req.body || {}) as { role?: string };
    const allowed = ['user', 'admin'];
    if (!allowed.includes(String(role))) return res.status(400).json({ error: 'Invalid role' });
    const u = await Users.findByIdAndUpdate(id, { $set: { role: role } }, { new: true });
    if (!u) return res.status(404).json({ error: 'User not found' });
    try { await writeAuditEntry(req as any, 'user.update_role', id, String(role)); } catch {}
    return res.status(200).json({ ok: true, user: { _id: String(u._id), role: (u as any).role } });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || 'Role update failed' });
  }
};

export default { searchUsers, getUserLedger };
