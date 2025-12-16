import { RequestHandler } from 'express';
import { ValidatedRequestWithJWT } from '../types/requests';
import { Users, Deposit } from '../models';
import { createCharge } from '../services/providers/coinbase_commerce';
import { createTransaction, verifyIPN } from '../services/providers/coinpayments';
import { createPayment as createNowPayment, createInvoice as createNowInvoice, estimatePayAmountUSD, verifyWebhookSignature as verifyNowpSig, getPayment as getNowPayment } from '../services/providers/nowpayments';
import userService from '../services/user_service';
import logger from '../helpers/axiom_logger';

export const createDepositIntent: RequestHandler = async (req: ValidatedRequestWithJWT<any>, res) => {
  try {
    const { amount, currency = 'USDT', payCurrency } = req.body || {};
    const desiredUSD = Number(amount);
    if (!Number.isFinite(desiredUSD) || desiredUSD <= 0) {
      return res.status(400).json({ error: 'Invalid amount' });
    }
    const minUSD = Number(process.env.MIN_DEPOSIT_USD || 1);
    const maxUSD = Number(process.env.MAX_DEPOSIT_USD || 10000);
    if (desiredUSD < minUSD || desiredUSD > maxUSD) {
      return res.status(400).json({ error: `Amount out of bounds (${minUSD} - ${maxUSD})` });
    }
    const provider = (process.env.PAYMENTS_PROVIDER || 'coinpayments').toLowerCase();
    if (provider === 'coinpayments') {
      const base = process.env.PUBLIC_BACKEND_URL || `${req.protocol}://${req.get('host')}`;
      const ipnUrl = `${base}/billing/webhook/coinpayments`;
      const tx = await createTransaction({ amount: desiredUSD, currency1: currency, currency2: currency, item_name: 'BetMate Deposit', ipn_url: ipnUrl });
      const dep = await new Deposit({ user_id: req.user._id, amount: desiredUSD, currency, provider: 'coinpayments', provider_ref: tx.txn_id, status: 'pending' }).save();
      return res.status(200).json({ hosted_url: tx.checkout_url, deposit_id: String(dep._id) });
    }

    if (provider === 'nowpayments') {
      const base = process.env.PUBLIC_BACKEND_URL || `${req.protocol}://${req.get('host')}`;
      const ipnUrl = `${base}/billing/webhook/nowpayments`;
      const selectedPayCurrency: string = (typeof payCurrency === 'string' && payCurrency.trim()) ? String(payCurrency).toUpperCase() : String(currency).toUpperCase();
      // Whitelist allowed currencies to avoid provider rejections
      const allowedList = (process.env.NOWPAYMENTS_ALLOWED_CURRENCIES || 'USDTTRC20,USDTBEP20,USDTERC20,USDC,BTC,ETH')
        .split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
      if (!allowedList.includes(selectedPayCurrency)) {
        return res.status(400).json({ error: 'Unsupported payCurrency', allowed: allowedList });
      }
      const feeRate = Math.max(0, Math.min(0.2, Number(process.env.DEPOSIT_FEE_RATE || 0)));
      const fixedFee = Math.max(0, Number(process.env.DEPOSIT_FIXED_FEE_USD || 0));
      const denom = Math.max(0.0001, 1 - feeRate);
      const chargeUSD = Math.round(((desiredUSD + fixedFee) / denom) * 100) / 100;
      const dep = await new Deposit({ user_id: req.user._id, amount: desiredUSD, currency: selectedPayCurrency, provider: 'nowpayments', status: 'pending', metadata: { fee_rate: feeRate, fixed_fee_usd: fixedFee, charge_usd: chargeUSD } as any }).save();
      const orderId = String(dep._id);
      const successUrl = process.env.NOWPAYMENTS_SUCCESS_URL;
      const cancelUrl = process.env.NOWPAYMENTS_CANCEL_URL;
      const payCurrencyEnv = process.env.NOWPAYMENTS_PAY_CURRENCY; // e.g., 'USDTTRC20' or 'USDC'
      const payload: any = {
        price_amount: chargeUSD,
        price_currency: 'USD',
        order_id: orderId,
        order_description: `BetMate Deposit (${currency})`,
        ipn_callback_url: ipnUrl,
        ...(successUrl ? { success_url: successUrl } : {}),
        ...(cancelUrl ? { cancel_url: cancelUrl } : {}),
      };
      // Always supply a pay_currency: prefer explicit env, fallback to user-selected
      payload.pay_currency = (payCurrencyEnv || selectedPayCurrency);
      try {
        const mode = (process.env.NOWPAYMENTS_CREATE_MODE || 'invoice').toLowerCase();
        if (mode === 'invoice') {
          const inv = await createNowInvoice(payload);
          dep.provider_ref = inv.id;
          dep.metadata = { ...(dep.metadata || {}), payment_url: inv.invoice_url } as any;
        } else {
          const payment = await createNowPayment(payload);
          dep.provider_ref = payment.payment_id;
          dep.metadata = { ...(dep.metadata || {}), payment_url: payment.payment_url } as any;
        }
        // Optional: fetch estimated crypto pay amount for display/debug
        try {
          const est = await estimatePayAmountUSD(chargeUSD, payload.pay_currency);
          dep.metadata = { ...(dep.metadata || {}), estimated_pay_amount: est.pay_amount } as any;
        } catch {}
        await dep.save();
        return res.status(200).json({ hosted_url: (dep.metadata as any)?.payment_url || '#', deposit_id: String(dep._id) });
      } catch (err) {
        // Extract axios error details if present
        const anyErr: any = err;
        const status = anyErr?.response?.status;
        const data = anyErr?.response?.data;
        const message = anyErr?.message || 'create_payment_failed';
        // Mark deposit failed and log error for observability
        dep.status = 'failed';
        dep.metadata = { ...(dep.metadata || {}), error: message, provider_status: status, provider_data: data } as any;
        await dep.save();
        logger.log({ level: 'error', event: 'nowpayments_create_payment_error', context: { deposit_id: orderId, message, status, data } });
        const debug = process.env.DEBUG_PROVIDER_ERRORS === 'true';
        if (debug) {
          return res.status(500).json({ error: 'Failed to create deposit intent', provider_error: { message, status, data } });
        }
        return res.status(500).json({ error: 'Failed to create deposit intent' });
      }
    }

    // Fallback: Coinbase Commerce
    const charge = await createCharge({ name: `BetMate Deposit (${currency})`, pricing_type: 'fixed_price', local_price: { amount: String(desiredUSD), currency: 'USD' }, metadata: { user_id: String(req.user._id), currency } });
    const dep = await new Deposit({ user_id: req.user._id, amount: desiredUSD, currency, provider: 'coinbase', provider_ref: charge.id, status: 'pending' }).save();
    return res.status(200).json({ hosted_url: charge.hosted_url, deposit_id: String(dep._id) });
  } catch (e) {
    return res.status(500).json({ error: 'Failed to create deposit intent' });
  }
};

export const listDeposits: RequestHandler = async (req: ValidatedRequestWithJWT<any>, res) => {
  try {
    const items = await Deposit.find({ user_id: req.user._id }).sort({ created_at: -1 }).limit(50);
    // Sanitize metadata to only expose safe fields
    const safe = items.map((d) => ({
      _id: d._id,
      amount: d.amount,
      currency: d.currency,
      provider: d.provider,
      provider_ref: d.provider_ref,
      status: d.status,
      metadata: { payment_url: (d as any)?.metadata?.payment_url },
      created_at: (d as any).created_at,
      updated_at: (d as any).updated_at,
    }));
    return res.status(200).json({ deposits: safe });
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

export const quoteDeposit: RequestHandler = async (req: ValidatedRequestWithJWT<any>, res) => {
  try {
    const desired = Number(req.query.amount || req.body?.amount || 0);
    const payCurrency = String((req.query.payCurrency || req.body?.payCurrency || 'USDT')).toUpperCase();
    if (!Number.isFinite(desired) || desired <= 0) return res.status(400).json({ error: 'Invalid amount' });
    const feeRate = Math.max(0, Math.min(0.2, Number(process.env.DEPOSIT_FEE_RATE || 0)));
    const fixedFee = Math.max(0, Number(process.env.DEPOSIT_FIXED_FEE_USD || 0));
    const denom = Math.max(0.0001, 1 - feeRate);
    const chargeUSD = Math.round(((desired + fixedFee) / denom) * 100) / 100;
    let payAmount = 0;
    try {
      const est = await estimatePayAmountUSD(chargeUSD, payCurrency);
      payAmount = est.pay_amount;
    } catch {}
    const minUSD = Number(process.env.MIN_DEPOSIT_USD || 1);
    const maxUSD = Number(process.env.MAX_DEPOSIT_USD || 10000);
    return res.status(200).json({
      desired_usd: desired,
      charge_usd: chargeUSD,
      fee_usd: Math.max(0, Math.round((chargeUSD - desired) * 100) / 100),
      fee_rate: feeRate,
      fixed_fee_usd: fixedFee,
      pay_currency: payCurrency,
      estimated_pay_amount: payAmount,
      bounds: { min_usd: minUSD, max_usd: maxUSD },
    });
  } catch (e) {
    return res.status(500).json({ error: 'Quote error' });
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

// Dev/Staging faucet: credit cash_balance for quick testing
// - In development: enabled for any authenticated user
// - In non-development: requires ENABLE_FAUCET=true and X-Admin-Key header
export const faucetCredit: RequestHandler = async (req: ValidatedRequestWithJWT<any>, res) => {
  try {
    const isDev = process.env.NODE_ENV === 'development';
    const { getFeatures: getRuntimeFeatures } = require('../utils/features_runtime');
    const ff = await getRuntimeFeatures();
    const enabled = ff.enableFaucet || process.env.ENABLE_FAUCET === 'true';
    if (!enabled) {
      return res.status(403).json({ error: 'Faucet disabled' });
    }

    // In non-dev environments, require an admin key by default to prevent abuse.
    // You can explicitly disable this requirement by setting FAUCET_REQUIRE_ADMIN_KEY=false
    // (useful on staging). If unset, the default is to require the key.
    const requireKeyEnv = process.env.FAUCET_REQUIRE_ADMIN_KEY;
    const requireAdminKey = (requireKeyEnv == null) ? true : (String(requireKeyEnv).toLowerCase() === 'true');
    if (!isDev && requireAdminKey) {
      const adminKey = process.env.ADMIN_API_KEY;
      const provided = req.header('X-Admin-Key') || req.header('x-admin-key');
      if (!adminKey || !provided || provided !== adminKey) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
    }

    const raw = Number(req.body?.amount ?? 100);
    if (!Number.isFinite(raw)) return res.status(400).json({ error: 'Invalid amount' });
    const amount = Math.max(1, Math.min(10000, Math.round(raw * 100) / 100));

    await userService.updateUserData(req.user._id, { $inc: { cash_balance: amount } });
    await userService.recordBalanceChange(req.user._id, amount, 'Faucet credit', undefined, 'Faucet', 'USDT');
    return res.status(200).json({ ok: true, credited: amount });
  } catch (e) {
    return res.status(500).json({ error: 'Faucet error' });
  }
};

// Admin-only: reconcile NOWPayments pending deposits by polling provider
export const reconcileNowpaymentsPending: RequestHandler = async (req, res) => {
  try {
    const limit = Math.max(1, Math.min(100, Number(req.query.limit) || 20));
    const items = await Deposit.find({ provider: 'nowpayments', status: 'pending' }).sort({ created_at: 1 }).limit(limit);
    const results: any[] = [];
    for (const dep of items) {
      const ref = dep.provider_ref;
      if (!ref) { results.push({ id: String(dep._id), action: 'skip_no_ref' }); continue; }
      try {
        const info = await getNowPayment(ref);
        const status = String(info?.payment_status || info?.status || '').toLowerCase();
        const confirmed = status === 'confirmed' || status === 'finished' || status === 'completed' || status === 'paid';
        const failed = status === 'failed' || status === 'cancelled';
        if (confirmed && dep.status !== 'confirmed') {
          dep.status = 'confirmed';
          await dep.save();
          try {
            await userService.updateUserData(dep.user_id, { $inc: { cash_balance: dep.amount } });
            await userService.recordBalanceChange(dep.user_id, dep.amount, 'Deposit', String(dep._id), 'Deposit', 'USDT');
          } catch (creditErr) {
            logger.log({ level: 'error', event: 'deposit_credit_error', context: { deposit_id: String(dep._id), message: (creditErr as any)?.message } });
          }
          results.push({ id: String(dep._id), provider_ref: ref, status: 'confirmed' });
        } else if (failed && dep.status !== 'confirmed') {
          dep.status = 'failed';
          await dep.save();
          results.push({ id: String(dep._id), provider_ref: ref, status: 'failed' });
        } else {
          results.push({ id: String(dep._id), provider_ref: ref, status: dep.status });
        }
      } catch (e) {
        results.push({ id: String(dep._id), provider_ref: ref, error: (e as any)?.message || 'fetch_failed' });
      }
    }
    return res.status(200).json({ ok: true, count: results.length, results });
  } catch (e) {
    return res.status(500).json({ error: 'Reconciliation error' });
  }
};

// Admin-only: reissue a NOWPayments invoice for a deposit missing provider_ref
export const reissueNowpaymentsInvoice: RequestHandler = async (req, res) => {
  try {
    const id = String(req.params.id || '');
    const dep = await Deposit.findById(id);
    if (!dep) return res.status(404).json({ error: 'Deposit not found' });
    if (dep.provider !== 'nowpayments') return res.status(400).json({ error: 'Not a NOWPayments deposit' });
    if (dep.status === 'confirmed') return res.status(400).json({ error: 'Already confirmed' });
    if (dep.provider_ref && !req.query.force) {
      return res.status(400).json({ error: 'Already has provider_ref; add ?force=true to overwrite' });
    }
    const base = process.env.PUBLIC_BACKEND_URL || `${req.protocol}://${req.get('host')}`;
    const ipnUrl = `${base}/billing/webhook/nowpayments`;
    const successUrl = process.env.NOWPAYMENTS_SUCCESS_URL;
    const cancelUrl = process.env.NOWPAYMENTS_CANCEL_URL;
    const payCurrencyEnv = process.env.NOWPAYMENTS_PAY_CURRENCY;
    const payload: any = {
      price_amount: dep.amount,
      price_currency: 'USD',
      order_id: String(dep._id),
      order_description: `BetMate Deposit (${dep.currency})`,
      ipn_callback_url: ipnUrl,
      ...(successUrl ? { success_url: successUrl } : {}),
      ...(cancelUrl ? { cancel_url: cancelUrl } : {}),
    };
    payload.pay_currency = payCurrencyEnv || dep.currency;
    const mode = (process.env.NOWPAYMENTS_CREATE_MODE || 'invoice').toLowerCase();
    if (mode === 'invoice') {
      const inv = await createNowInvoice(payload);
      dep.provider_ref = inv.id;
      dep.metadata = { ...(dep.metadata || {}), payment_url: inv.invoice_url } as any;
    } else {
      const payment = await createNowPayment(payload);
      dep.provider_ref = payment.payment_id;
      dep.metadata = { ...(dep.metadata || {}), payment_url: payment.payment_url } as any;
    }
    dep.status = 'pending';
    await dep.save();
    const url = (dep.metadata as any)?.payment_url || '#';
    return res.status(200).json({ ok: true, deposit_id: String(dep._id), provider_ref: dep.provider_ref, payment_url: url });
  } catch (e) {
    return res.status(500).json({ error: 'Reissue error' });
  }
};

export default {
  createDepositIntent,
  listDeposits,
  quoteDeposit,
  coinpaymentsWebhook,
  nowpaymentsWebhook,
  nowpaymentsWebhookMock,
  faucetCredit,
  reconcileNowpaymentsPending,
  reissueNowpaymentsInvoice,
};
