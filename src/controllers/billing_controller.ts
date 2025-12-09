import { RequestHandler } from 'express';
import { ValidatedRequestWithJWT } from '../types/requests';
import { Users, Deposit } from '../models';
import { createCharge } from '../services/providers/coinbase_commerce';
import { createTransaction, verifyIPN } from '../services/providers/coinpayments';
import userService from '../services/user_service';
import logger from '../helpers/axiom_logger';

export const createDepositIntent: RequestHandler = async (req: ValidatedRequestWithJWT<any>, res) => {
  try {
    const { amount, currency = 'USDT' } = req.body || {};
    const num = Number(amount);
    if (!Number.isFinite(num) || num <= 0) {
      return res.status(400).json({ error: 'Invalid amount' });
    }
    const provider = (process.env.PAYMENTS_PROVIDER || 'coinpayments').toLowerCase();
    if (provider === 'coinpayments') {
      const ipnUrl = `${process.env.PUBLIC_BACKEND_URL || ''}/billing/webhook/coinpayments`;
      const tx = await createTransaction({ amount: num, currency1: currency, currency2: currency, item_name: 'BetMate Deposit', ipn_url: ipnUrl });
      const dep = await new Deposit({ user_id: req.user._id, amount: num, currency, provider: 'coinpayments', provider_ref: tx.txn_id, status: 'pending' }).save();
      return res.status(200).json({ hosted_url: tx.checkout_url, deposit_id: String(dep._id) });
    }

    // Fallback: Coinbase Commerce
    const charge = await createCharge({ name: `BetMate Deposit (${currency})`, pricing_type: 'fixed_price', local_price: { amount: String(num), currency: 'USD' }, metadata: { user_id: String(req.user._id), currency } });
    const dep = await new Deposit({ user_id: req.user._id, amount: num, currency, provider: 'coinbase', provider_ref: charge.id, status: 'pending' }).save();
    return res.status(200).json({ hosted_url: charge.hosted_url, deposit_id: String(dep._id) });
  } catch (e) {
    return res.status(500).json({ error: 'Failed to create deposit intent' });
  }
};

export const listDeposits: RequestHandler = async (req: ValidatedRequestWithJWT<any>, res) => {
  try {
    const items = await Deposit.find({ user_id: req.user._id }).sort({ created_at: -1 }).limit(50);
    return res.status(200).json({ deposits: items });
  } catch (e) {
    return res.status(500).json({ error: 'Failed to fetch deposits' });
  }
};

// Webhook stub — does not accept events until signature verification is implemented
// CoinPayments IPN webhook
export const coinpaymentsWebhook: RequestHandler = async (req, res) => {
  try {
    const raw = (req as any).rawBody || JSON.stringify(req.body);
    const hmac = req.header('HMAC') || '';
    if (!verifyIPN(typeof raw === 'string' ? raw : raw.toString(), hmac)) {
      return res.status(400).json({ error: 'Invalid signature' });
    }
    const { txn_id, status, currency1, amount1 } = req.body || {};
    if (!txn_id) return res.status(400).json({ error: 'Missing txn_id' });
    // status >=100 confirmed, status ==2 confirmed as well per docs
    const confirmed = Number(status) === 2 || Number(status) >= 100;
    const dep = await Deposit.findOne({ provider: 'coinpayments', provider_ref: String(txn_id) });
    if (!dep) return res.status(200).json({ ok: true }); // ignore unknown
    if (confirmed && dep.status !== 'confirmed') {
      dep.status = 'confirmed';
      await dep.save();
      try {
        await userService.updateUserData(dep.user_id, { $inc: { cash_balance: dep.amount } });
        await userService.recordBalanceChange(dep.user_id, dep.amount, 'Deposit', String(dep._id), 'Deposit', 'USDT');
      } catch (creditErr) {
        logger.log({ level: 'error', event: 'deposit_credit_error', context: { deposit_id: String(dep._id), message: (creditErr as any)?.message } });
      }
    }
    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: 'Webhook error' });
  }
};

export default {
  createDepositIntent,
  listDeposits,
  coinpaymentsWebhook,
};
