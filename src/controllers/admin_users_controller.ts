import { RequestHandler } from 'express';
import mongoose, { Types } from 'mongoose';
import { Users, Wager, BalanceHistory } from '../models';
import userService from '../services/user_service';
import { writeAuditEntry } from '../utils/admin_audit';
import { UserRole } from '../types/models/user';

export const searchUsers: RequestHandler = async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    const limit = Math.max(1, Math.min(100, Number(req.query.limit) || 20));
    const skip = Math.max(0, Number(req.query.skip) || 0);

    const filter: any = {};
    if (q) {
      // search by email substring; if q looks like ObjectId, also allow exact _id match
      const arr: any[] = [{ email: { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } }];
      // Use mongoose.isValidObjectId for broad @types compatibility
      if (mongoose.isValidObjectId(q)) arr.push({ _id: Types.ObjectId(q) });
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
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ error: 'Invalid user id' });
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
    const allowed = ['user', 'admin'] as const;
    const r = String(role).toLowerCase();
    if (!allowed.includes(r as any)) return res.status(400).json({ error: 'Invalid role' });

    const newRole = r === 'admin' ? UserRole.ADMIN : UserRole.USER;
    const u = await Users.findByIdAndUpdate(id, { $set: { role: newRole } }, { new: true });
    if (!u) return res.status(404).json({ error: 'User not found' });
    try { await writeAuditEntry(req as any, 'user.update_role', id, String(role)); } catch {}
    return res.status(200).json({ ok: true, user: { _id: String(u._id), role: (u as any).role } });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || 'Role update failed' });
  }
};

export const deleteUser: RequestHandler = async (req, res) => {
  try {
    const id = String(req.params.id || '');
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ error: 'Invalid user id' });

    const target = await Users.findById(id).lean();
    if (!target) return res.status(404).json({ error: 'User not found' });

    // Prevent deleting the last admin account
    if ((target as any).role === UserRole.ADMIN) {
      const countAdmins = await Users.countDocuments({ role: UserRole.ADMIN });
      if (countAdmins <= 1) {
        return res.status(400).json({ error: 'Cannot delete the last admin account' });
      }
    }

    const cascade = String(req.query.cascade || '1') !== '0';
    if (cascade) {
      await Promise.all([
        // Remove wagers and balance history owned by the user to keep admin UI tidy
        // Pass string ids; mongoose will cast to ObjectId and TS types remain compatible.
        Wager.deleteMany({ better_id: id as any }),
        BalanceHistory.deleteMany({ user_id: id as any }),
      ]);
    }

    const ok = await userService.deleteUser(id);
    if (!ok) return res.status(404).json({ error: 'User not found' });
    try { await writeAuditEntry(req as any, 'user.delete', id, cascade ? 'cascade' : 'no-cascade'); } catch {}
    return res.status(200).json({ ok: true, deleted: id, cascade });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || 'Delete failed' });
  }
};

export default { searchUsers, getUserLedger, adjustBalance, updateRole, deleteUser };
