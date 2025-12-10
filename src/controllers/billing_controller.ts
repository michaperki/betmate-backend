import { RequestHandler } from 'express';
import { ValidatedRequestWithJWT } from '../types/requests';
import { Users, Deposit } from '../models';
import { createCharge } from '../services/providers/coinbase_commerce';
import { createTransaction, verifyIPN } from '../services/providers/coinpayments';
import { createPayment as createNowPayment, verifyWebhookSignature as verifyNowpSig } from '../services/providers/nowpayments';
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
      const base = process.env.PUBLIC_BACKEND_URL || `${req.protocol}://${req.get('host')}`;
      const ipnUrl = `${base}/billing/webhook/coinpayments`;
      const tx = await createTransaction({ amount: num, currency1: currency, currency2: currency, item_name: 'BetMate Deposit', ipn_url: ipnUrl });
      const dep = await new Deposit({ user_id: req.user._id, amount: num, currency, provider: 'coinpayments', provider_ref: tx.txn_id, status: 'pending' }).save();
      return res.status(200).json({ hosted_url: tx.checkout_url, deposit_id: String(dep._id) });
    }

    if (provider === 'nowpayments') {
      const base = process.env.PUBLIC_BACKEND_URL || `${req.protocol}://${req.get('host')}`;
      const ipnUrl = `${base}/billing/webhook/nowpayments`;
      const dep = await new Deposit({ user_id: req.user._id, amount: num, currency, provider: 'nowpayments', status: 'pending' }).save();
      const orderId = String(dep._id);
      const successUrl = process.env.NOWPAYMENTS_SUCCESS_URL;
      const cancelUrl = process.env.NOWPAYMENTS_CANCEL_URL;
      const payCurrencyEnv = process.env.NOWPAYMENTS_PAY_CURRENCY; // e.g., 'USDTTRC20' or 'USDC'
      const payload: any = {
        price_amount: num,
        price_currency: 'USD',
        order_id: orderId,
        order_description: `BetMate Deposit (${currency})`,
        ipn_callback_url: ipnUrl,
        ...(successUrl ? { success_url: successUrl } : {}),
        ...(cancelUrl ? { cancel_url: cancelUrl } : {}),
      };
      if (payCurrencyEnv) payload.pay_currency = payCurrencyEnv;
      try {
        const payment = await createNowPayment(payload);
        dep.provider_ref = payment.payment_id;
        dep.metadata = { ...(dep.metadata || {}), payment_url: payment.payment_url } as any;
        await dep.save();
        return res.status(200).json({ hosted_url: payment.payment_url, deposit_id: String(dep._id) });
      } catch (err) {
        // Mark deposit failed and log error for observability
        dep.status = 'failed';
        dep.metadata = { ...(dep.metadata || {}), error: (err as any)?.message || 'create_payment_failed' } as any;
        await dep.save();
        logger.log({ level: 'error', event: 'nowpayments_create_payment_error', context: { deposit_id: orderId, message: (err as any)?.message } });
        return res.status(500).json({ error: 'Failed to create deposit intent' });
      }
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

export const nowpaymentsWebhook: RequestHandler = async (req, res) => {
  try {
    const raw = (req as any).rawBody || JSON.stringify(req.body);
    const sig = req.header('x-nowpayments-sig') || req.header('x-nowpayments-signature') || '';
    if (!verifyNowpSig(typeof raw === 'string' ? raw : raw.toString(), sig)) {
      return res.status(400).json({ error: 'Invalid signature' });
    }
    const body = req.body || {};
    const paymentId = String(body?.payment_id || body?.id || '');
    const orderId = body?.order_id ? String(body.order_id) : '';
    const status = String(body?.payment_status || body?.status || '').toLowerCase();
    if (!paymentId && !orderId) return res.status(400).json({ error: 'Missing identifiers' });

    let dep = null as any;
    if (orderId) dep = await Deposit.findById(orderId);
    if (!dep && paymentId) dep = await Deposit.findOne({ provider: 'nowpayments', provider_ref: paymentId });
    if (!dep) return res.status(200).json({ ok: true });

    const confirmed = status === 'confirmed' || status === 'finished' || status === 'completed' || status === 'paid';
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
    if (!confirmed && status === 'failed') {
      if (dep.status !== 'confirmed') {
        dep.status = 'failed';
        await dep.save();
      }
    }
    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: 'Webhook error' });
  }
};

export const nowpaymentsWebhookMock: RequestHandler = async (req, res) => {
  try {
    const key = req.header('x-dev-webhook-key') || req.query.key as string || '';
    const required = process.env.DEV_WEBHOOK_KEY || '';
    if (process.env.NODE_ENV === 'production' || !required || key !== required) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const { deposit_id, status = 'confirmed' } = req.body || {};
    if (!deposit_id) return res.status(400).json({ error: 'Missing deposit_id' });
    const dep = await Deposit.findById(String(deposit_id));
    if (!dep) return res.status(404).json({ error: 'Deposit not found' });
    const isConfirmed = String(status).toLowerCase() === 'confirmed';
    if (isConfirmed && dep.status !== 'confirmed') {
      dep.status = 'confirmed';
      await dep.save();
      try {
        await userService.updateUserData(dep.user_id, { $inc: { cash_balance: dep.amount } });
        await userService.recordBalanceChange(dep.user_id, dep.amount, 'Deposit', String(dep._id), 'Deposit', 'USDT');
      } catch (creditErr) {
        logger.log({ level: 'error', event: 'deposit_credit_error', context: { deposit_id: String(dep._id), message: (creditErr as any)?.message } });
      }
    } else if (!isConfirmed) {
      if (dep.status !== 'confirmed') {
        dep.status = 'failed';
        await dep.save();
      }
    }
    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: 'Mock webhook error' });
  }
};

export default {
  createDepositIntent,
  listDeposits,
  coinpaymentsWebhook,
  nowpaymentsWebhook,
  nowpaymentsWebhookMock,
};
