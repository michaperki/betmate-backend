import { RequestHandler } from 'express';
import { Users } from '../models';

export const listKycUsers: RequestHandler = async (req, res) => {
  try {
    const limit = Math.max(1, Math.min(500, Number(req.query.limit) || 100));
    const status = String(req.query.status || '').toLowerCase();
    const q: any = {};
    if (status && ['none','required','pending','approved','rejected'].includes(status)) q.kyc_status = status;
    const rows = await Users.find(q).sort({ kyc_updated_at: -1, _id: -1 }).limit(limit).lean();
    const data = (rows || []).map((u: any) => ({
      _id: String(u._id),
      email: u.email,
      role: u.role,
      kyc_status: u.kyc_status || 'none',
      kyc_updated_at: u.kyc_updated_at,
    }));
    res.status(200).json({ users: data });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Failed to list KYC users' });
  }
};

export const approveKyc: RequestHandler = async (req, res) => {
  try {
    const id = String(req.params.id || '');
    const u = await Users.findByIdAndUpdate(id, { $set: { kyc_status: 'approved', kyc_updated_at: new Date() } }, { new: true });
    if (!u) return res.status(404).json({ error: 'User not found' });
    res.status(200).json({ ok: true, user: { _id: String(u._id), kyc_status: (u as any).kyc_status } });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Approve KYC error' });
  }
};

export const rejectKyc: RequestHandler = async (req, res) => {
  try {
    const id = String(req.params.id || '');
    const u = await Users.findByIdAndUpdate(id, { $set: { kyc_status: 'rejected', kyc_updated_at: new Date() } }, { new: true });
    if (!u) return res.status(404).json({ error: 'User not found' });
    res.status(200).json({ ok: true, user: { _id: String(u._id), kyc_status: (u as any).kyc_status } });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Reject KYC error' });
  }
};

export default { listKycUsers, approveKyc, rejectKyc };

