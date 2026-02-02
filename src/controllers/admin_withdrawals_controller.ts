import { RequestHandler } from 'express';
import { Types } from 'mongoose';
import Withdrawal from '../models/withdrawal_model';
import userService from '../services/user_service';
import { createPayout as createNowPayout } from '../services/providers/nowpayments_payouts';

export const listWithdrawals: RequestHandler = async (req, res) => {
  try {
    const limit = Math.max(1, Math.min(200, Number(req.query.limit) || 50));
    const status = String(req.query.status || '').toLowerCase();
    const sinceISO = String(req.query.since || '');
    const q: any = {};
    if (status && ['requested','approved','rejected','processing','paid','failed','cancelled'].includes(status)) q.status = status;
    if (sinceISO) {
      const d = new Date(sinceISO);
      if (!isNaN(d.getTime())) q.created_at = { $gte: d };
    }
    const rows = await Withdrawal.find(q).sort({ created_at: -1 }).limit(limit).lean();
    const data = (rows || []).map((r: any) => ({
      _id: String(r._id),
      user_id: String(r.user_id),
      amount: r.amount,
      currency: r.currency,
      address: r.address,
      status: r.status,
      provider: r.provider,
      provider_ref: r.provider_ref,
      created_at: r.created_at,
      metadata: r.metadata,
      admin_notes: r.admin_notes,
    }));
    res.status(200).json({ withdrawals: data });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Failed to list withdrawals' });
  }
};

async function refundHoldIfNeeded(wd: any) {
  if (!wd) return;
  const meta = (wd.metadata || {}) as any;
  if (meta.hold_refunded_at) return; // idempotent
  await userService.updateUserData(wd.user_id, { $inc: { cash_balance: wd.amount } });
  await userService.recordBalanceChange(wd.user_id, wd.amount, 'Withdrawal refund', String(wd._id), 'Withdrawal', 'USDT');
  wd.metadata = { ...meta, hold_refunded_at: new Date().toISOString() } as any;
}

export const approveWithdrawal: RequestHandler = async (req, res) => {
  try {
    const id = String(req.params.id || '');
    const wd = await Withdrawal.findById(id);
    if (!wd) return res.status(404).json({ error: 'Not found' });
    if (wd.status === 'approved') return res.status(200).json({ ok: true, status: wd.status });
    if (wd.status !== 'requested') return res.status(400).json({ error: `Cannot approve from status ${wd.status}` });

    // Attempt automated payout via NOWPayments (if API key configured)
    try {
      const base = process.env.PUBLIC_BACKEND_URL || `${req.protocol}://${req.get('host')}`;
      const ipnUrl = `${base}/billing/webhook/nowpayments-payout`;
      const out = await createNowPayout({
        amount_usd: wd.amount,
        pay_currency: wd.currency,
        address: wd.address,
        ipn_callback_url: ipnUrl,
        withdrawal_id: String(wd._id),
      });
      wd.status = 'processing';
      wd.provider = 'nowpayments';
      wd.provider_ref = out.payout_id;
      (wd as any).metadata = { ...(wd as any).metadata, provider_status: out.status };
      await wd.save();
      try {
        const { getFeatures: getRuntimeFeatures } = require('../utils/features_runtime');
        const ff = await getRuntimeFeatures();
        if ((ff as any)?.enableEmailWithdrawals) {
          const user = await userService.getUser(wd.user_id);
          const { sendWithdrawalStatusEmail } = require('../services/email_service');
          if (user && (user as any).email) await sendWithdrawalStatusEmail((user as any).email, 'processing', wd.amount, wd.currency, String(wd._id));
        }
      } catch {}
      return res.status(200).json({ ok: true, status: wd.status, provider_ref: wd.provider_ref });
    } catch (e: any) {
      // Fallback: mark approved only (manual payout path)
      wd.status = 'approved';
      await wd.save();
      try {
        const { getFeatures: getRuntimeFeatures } = require('../utils/features_runtime');
        const ff = await getRuntimeFeatures();
        if ((ff as any)?.enableEmailWithdrawals) {
          const user = await userService.getUser(wd.user_id);
          const { sendWithdrawalStatusEmail } = require('../services/email_service');
          if (user && (user as any).email) await sendWithdrawalStatusEmail((user as any).email, 'approved', wd.amount, wd.currency, String(wd._id));
        }
      } catch {}
      return res.status(200).json({ ok: true, status: wd.status, note: 'Payout provider error; manual approval set' });
    }
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || 'Approve error' });
  }
};

export const rejectWithdrawal: RequestHandler = async (req, res) => {
  try {
    const id = String(req.params.id || '');
    const wd = await Withdrawal.findById(id);
    if (!wd) return res.status(404).json({ error: 'Not found' });
    if (['paid','failed','cancelled','rejected'].includes(wd.status)) return res.status(200).json({ ok: true, status: wd.status });
    await refundHoldIfNeeded(wd);
    wd.status = 'rejected';
    await wd.save();
    try {
      const { getFeatures: getRuntimeFeatures } = require('../utils/features_runtime');
      const ff = await getRuntimeFeatures();
      if ((ff as any)?.enableEmailWithdrawals) {
        const user = await userService.getUser(wd.user_id);
        const { sendWithdrawalStatusEmail } = require('../services/email_service');
        if (user && (user as any).email) await sendWithdrawalStatusEmail((user as any).email, 'rejected', wd.amount, wd.currency, String(wd._id));
      }
    } catch {}
    return res.status(200).json({ ok: true, status: wd.status });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || 'Reject error' });
  }
};

export const markProcessing: RequestHandler = async (req, res) => {
  try {
    const id = String(req.params.id || '');
    const wd = await Withdrawal.findById(id);
    if (!wd) return res.status(404).json({ error: 'Not found' });
    if (wd.status === 'processing') return res.status(200).json({ ok: true, status: wd.status });
    if (wd.status !== 'approved') return res.status(400).json({ error: `Cannot mark processing from status ${wd.status}` });
    wd.status = 'processing';
    await wd.save();
    try {
      const { getFeatures: getRuntimeFeatures } = require('../utils/features_runtime');
      const ff = await getRuntimeFeatures();
      if ((ff as any)?.enableEmailWithdrawals) {
        const user = await userService.getUser(wd.user_id);
        const { sendWithdrawalStatusEmail } = require('../services/email_service');
        if (user && (user as any).email) await sendWithdrawalStatusEmail((user as any).email, 'processing', wd.amount, wd.currency, String(wd._id));
      }
    } catch {}
    return res.status(200).json({ ok: true, status: wd.status });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || 'Processing error' });
  }
};

export const markPaid: RequestHandler = async (req, res) => {
  try {
    const id = String(req.params.id || '');
    const wd = await Withdrawal.findById(id);
    if (!wd) return res.status(404).json({ error: 'Not found' });
    if (wd.status === 'paid') return res.status(200).json({ ok: true, status: wd.status });
    if (!['approved','processing'].includes(wd.status)) return res.status(400).json({ error: `Cannot mark paid from status ${wd.status}` });
    wd.status = 'paid';
    await wd.save();
    try {
      const { getFeatures: getRuntimeFeatures } = require('../utils/features_runtime');
      const ff = await getRuntimeFeatures();
      if ((ff as any)?.enableEmailWithdrawals) {
        const user = await userService.getUser(wd.user_id);
        const { sendWithdrawalStatusEmail } = require('../services/email_service');
        if (user && (user as any).email) await sendWithdrawalStatusEmail((user as any).email, 'paid', wd.amount, wd.currency, String(wd._id));
      }
    } catch {}
    return res.status(200).json({ ok: true, status: wd.status });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || 'Paid error' });
  }
};

export const markFailed: RequestHandler = async (req, res) => {
  try {
    const id = String(req.params.id || '');
    const wd = await Withdrawal.findById(id);
    if (!wd) return res.status(404).json({ error: 'Not found' });
    if (wd.status === 'failed') return res.status(200).json({ ok: true, status: wd.status });
    if (!['approved','processing'].includes(wd.status)) return res.status(400).json({ error: `Cannot mark failed from status ${wd.status}` });
    await refundHoldIfNeeded(wd);
    wd.status = 'failed';
    await wd.save();
    try {
      const { getFeatures: getRuntimeFeatures } = require('../utils/features_runtime');
      const ff = await getRuntimeFeatures();
      if ((ff as any)?.enableEmailWithdrawals) {
        const user = await userService.getUser(wd.user_id);
        const { sendWithdrawalStatusEmail } = require('../services/email_service');
        if (user && (user as any).email) await sendWithdrawalStatusEmail((user as any).email, 'failed', wd.amount, wd.currency, String(wd._id));
      }
    } catch {}
    return res.status(200).json({ ok: true, status: wd.status });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || 'Failed mark error' });
  }
};

export default {
  listWithdrawals,
  approveWithdrawal,
  rejectWithdrawal,
  markProcessing,
  markPaid,
  markFailed,
};
