import { RequestHandler } from 'express';
import { ValidatedRequestWithJWT } from '../types/requests';
import { Users, Deposit, Withdrawal } from '../models';
import { createCharge } from '../services/providers/coinbase_commerce';
import { createTransaction, verifyIPN } from '../services/providers/coinpayments';
import { createPayment as createNowPayment, createInvoice as createNowInvoice, estimatePayAmountUSD, verifyWebhookSignature as verifyNowpSig, getPayment as getNowPayment } from '../services/providers/nowpayments';
import userService from '../services/user_service';
import logger from '../helpers/axiom_logger';
import type { RequestWithJWT } from '../types/requests';
import { verifyWebhookSignature as verifyNowSig } from '../services/providers/nowpayments';
import { getPayout as getNowPayout } from '../services/providers/nowpayments_payouts';

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
    const provider = (
      process.env.PAYMENTS_PROVIDER
      || (process.env.NODE_ENV === 'production' ? 'coinpayments' : 'nowpayments')
    ).toLowerCase();
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

// NOWPayments payout webhook
export const nowpaymentsPayoutWebhook: RequestHandler = async (req, res) => {
  try {
    const raw = (req as any).rawBody || JSON.stringify(req.body);
    const sig = req.header('x-nowpayments-sig') || req.header('x-nowpayments-signature') || '';
    if (!verifyNowSig(typeof raw === 'string' ? raw : raw.toString(), sig)) {
      return res.status(400).json({ error: 'Invalid signature' });
    }
    const body = req.body || {};
    const payoutId = String(body?.payout_id || body?.id || '');
    const orderId = body?.withdrawal_id ? String(body.withdrawal_id) : '';
    const status = String(body?.status || body?.payment_status || '').toLowerCase();
    if (!payoutId && !orderId) return res.status(400).json({ error: 'Missing identifiers' });

    let wd = null as any;
    if (orderId) wd = await Withdrawal.findById(orderId);
    if (!wd && payoutId) wd = await Withdrawal.findOne({ provider: 'nowpayments', provider_ref: payoutId });
    if (!wd) return res.status(200).json({ ok: true });

    const confirmed = ['confirmed','finished','completed','paid','success'].includes(status);
    const failed = ['failed','cancelled','rejected','error'].includes(status);
    if (confirmed && wd.status !== 'paid') {
      wd.status = 'paid';
      wd.provider = 'nowpayments';
      wd.provider_ref = wd.provider_ref || payoutId;
      await wd.save();
      return res.status(200).json({ ok: true });
    }
    if (failed) {
      // Refund on failure if not already paid
      if (wd.status !== 'paid') {
        try {
          await userService.updateUserData(wd.user_id, { $inc: { cash_balance: wd.amount } });
          await userService.recordBalanceChange(wd.user_id, wd.amount, 'Withdrawal refund', String(wd._id), 'Withdrawal', 'USDT');
        } catch {}
      }
      wd.status = 'failed';
      wd.provider = 'nowpayments';
      wd.provider_ref = wd.provider_ref || payoutId;
      await wd.save();
      return res.status(200).json({ ok: true });
    }
    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: 'Webhook error' });
  }
};

export const nowpaymentsWebhookMock: RequestHandler = async (req, res) => {
  try {
    const key = (req.header('x-dev-webhook-key') || (req.query.key as string) || '').toString();
    // In non-production, allow a sane default if DEV_WEBHOOK_KEY is not provided
    const required = (process.env.DEV_WEBHOOK_KEY || (process.env.NODE_ENV !== 'production' ? 'test-dev-webhook-key' : '')).toString();
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
    // Optional currency selector: 'BET' | 'USDT' | 'both' (default: both for backward compatibility)
    const bodyCurrency = String(req.body?.currency || 'both').toUpperCase();
    const creditTokens = (bodyCurrency === 'BET' || bodyCurrency === 'BOTH');
    const creditCash = (bodyCurrency === 'USDT' || bodyCurrency === 'BOTH');
    // Demo ratio 1 USD = 100 BET.
    const tokenAmt = Math.max(1, Math.round(amount * 100));

    const inc: any = {};
    const ledgerTasks: Array<Promise<any>> = [];
    if (creditCash) {
      inc.cash_balance = (inc.cash_balance || 0) + amount;
    }
    if (creditTokens) {
      inc.token_balance = (inc.token_balance || 0) + tokenAmt;
      // Maintain legacy `account` mirror during migration
      inc.account = (inc.account || 0) + tokenAmt;
    }
    if (Object.keys(inc).length) {
      await userService.updateUserData(req.user._id, { $inc: inc } as any);
    }
    if (creditCash) ledgerTasks.push(userService.recordBalanceChange(req.user._id, amount, 'Faucet credit', undefined, 'Faucet', 'USDT'));
    if (creditTokens) ledgerTasks.push(userService.recordBalanceChange(req.user._id, tokenAmt, 'Faucet credit', undefined, 'Faucet', 'BET'));
    await Promise.allSettled(ledgerTasks);
    return res.status(200).json({ ok: true, credited: creditCash ? amount : 0, tokens: creditTokens ? tokenAmt : 0 });
  } catch (e) {
    return res.status(500).json({ error: 'Faucet error' });
  }
};

// List current user's withdrawals
export const listWithdrawals: RequestHandler = async (req: ValidatedRequestWithJWT<any>, res) => {
  try {
    const limit = Math.max(1, Math.min(200, Number(req.query.limit) || 50));
    const rows = await Withdrawal.find({ user_id: req.user._id }).sort({ created_at: -1 }).limit(limit).lean();
    const data = (rows || []).map((r: any) => ({
      _id: String(r._id),
      amount: r.amount,
      currency: r.currency,
      address: r.address,
      status: r.status,
      provider: r.provider,
      provider_ref: r.provider_ref,
      created_at: r.created_at,
      metadata: r.metadata,
    }));
    return res.status(200).json({ withdrawals: data });
  } catch (e) {
    return res.status(500).json({ error: 'Failed to fetch withdrawals' });
  }
};

// Request a withdrawal (places a hold immediately)
export const requestWithdrawal: RequestHandler = async (req: RequestWithJWT, res) => {
  try {
    const { amount, currency = 'USDTTRC20', address, method, handle } = req.body || {};
    if (!req.user?._id) return res.status(401).json({ error: 'Unauthorized' });

    // Feature flags
    const { getFeatures } = require('../utils/features_runtime');
    const ff = await getFeatures();
    const enabled = (ff as any).enableWithdrawals === true || process.env.ENABLE_WITHDRAWALS === 'true';
    const requireKyc = (ff as any).requireKyc === true || process.env.REQUIRE_KYC === 'true';
    if (!enabled) return res.status(403).json({ error: 'Withdrawals disabled' });

    // KYC gate
    const kycStatus = (req.user as any)?.kyc_status || 'none';
    if (requireKyc && kycStatus !== 'approved') {
      return res.status(403).json({ error: 'KYC required' });
    }

    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) return res.status(400).json({ error: 'Invalid amount' });
    const minUSD = Math.max(1, Number(process.env.WITHDRAW_MIN_USD || 10));
    const maxUSD = Math.max(minUSD, Number(process.env.WITHDRAW_MAX_USD || 5000));
    if (amt < minUSD || amt > maxUSD) return res.status(400).json({ error: `Amount out of bounds (${minUSD}-${maxUSD})` });

    // Allowed payout currencies
    const requestedMethod = String(method || '').toLowerCase();
    const isManual = (requestedMethod === 'manual' || requestedMethod === 'venmo');
    const allowedList = (process.env.WITHDRAW_ALLOWED_CURRENCIES || process.env.NOWPAYMENTS_ALLOWED_CURRENCIES || 'USDTTRC20,USDTBEP20,USDTERC20,USDC,BTC,ETH')
      .split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
    const payCurrency = isManual ? 'USD' : String(currency || '').toUpperCase();
    if (!isManual && !allowedList.includes(payCurrency)) {
      return res.status(400).json({ error: 'Unsupported currency', allowed: allowedList });
    }

    // Basic address validation heuristics
    let dest = '';
    if (isManual) {
      const h = String(handle || address || '').trim();
      if (!h) return res.status(400).json({ error: 'Missing payout handle' });
      // Minimal Venmo handle heuristic: allow @name or name without spaces
      if (!/^@?[A-Za-z0-9_\-\.]{2,64}$/.test(h)) return res.status(400).json({ error: 'Invalid payout handle format' });
      dest = h;
    } else {
      const addr = String(address || '').trim();
      if (!addr) return res.status(400).json({ error: 'Missing address' });
      const isEvm = payCurrency.includes('ERC20') || payCurrency.includes('BEP20') || payCurrency === 'USDC' || payCurrency === 'ETH' || payCurrency === 'USDT';
      const isTron = payCurrency.includes('TRC20');
      if (isEvm) {
        if (!/^0x[a-fA-F0-9]{40}$/.test(addr)) return res.status(400).json({ error: 'Invalid EVM address format' });
      } else if (isTron) {
        if (!/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(addr)) return res.status(400).json({ error: 'Invalid TRON address format' });
      } else if (payCurrency === 'BTC') {
        // Basic BTC address heuristic: legacy (1/3...) or bech32 (bc1...)
        if (!/^(bc1[0-9a-z]{11,71}|[13][a-km-zA-HJ-NP-Z1-9]{25,34})$/.test(addr)) {
          return res.status(400).json({ error: 'Invalid BTC address format' });
        }
      }
      dest = addr;
    }

    // Velocity limit: restrict concurrent open withdrawals
    const maxOpen = Math.max(1, Number(process.env.WITHDRAW_MAX_OPEN || 1));
    const openCount = await Withdrawal.countDocuments({ user_id: req.user._id, status: { $in: ['requested', 'approved', 'processing'] } });
    if (openCount >= maxOpen) return res.status(429).json({ error: 'Too many open withdrawals' });

    // Check user balance
    const freshUser = await Users.findById(req.user._id);
    if (!freshUser) return res.status(404).json({ error: 'User not found' });
    const bal = (freshUser as any).cash_balance || 0;
    if (bal < amt) return res.status(400).json({ error: 'Insufficient balance' });

    // Create withdrawal first
    const wd = await new Withdrawal({
      user_id: req.user._id,
      amount: amt,
      currency: payCurrency,
      address: dest,
      status: 'requested',
      provider: 'manual',
      metadata: isManual ? { method: 'manual', subtype: 'venmo' } : undefined,
    }).save();

    // Place hold by debiting cash_balance
    try {
      await userService.updateUserData(req.user._id, { $inc: { cash_balance: -amt } });
      await userService.recordBalanceChange(req.user._id, -amt, 'Withdrawal hold', String(wd._id), 'Withdrawal', 'USDT');
    } catch (e) {
      try { wd.status = 'failed'; await wd.save(); } catch {}
      return res.status(500).json({ error: 'Failed to place hold' });
    }

    return res.status(200).json({ ok: true, withdrawal_id: String(wd._id) });
  } catch (e) {
    return res.status(500).json({ error: 'Withdrawal request error' });
  }
};

// Cancel a requested withdrawal (user‑initiated)
export const cancelWithdrawal: RequestHandler = async (req: RequestWithJWT, res) => {
  try {
    if (!req.user?._id) return res.status(401).json({ error: 'Unauthorized' });
    const id = String(req.params.id || '');
    const wd = await Withdrawal.findById(id);
    if (!wd || String(wd.user_id) !== String(req.user._id)) {
      return res.status(404).json({ error: 'Not found' });
    }
    if (wd.status !== 'requested') {
      return res.status(400).json({ error: 'Cannot cancel in current status' });
    }
    // Refund hold
    try {
      await userService.updateUserData(req.user._id, { $inc: { cash_balance: wd.amount } });
      await userService.recordBalanceChange(req.user._id, wd.amount, 'Withdrawal refund', String(wd._id), 'Withdrawal', 'USDT');
    } catch (e) {
      return res.status(500).json({ error: 'Refund failed' });
    }
    wd.status = 'cancelled';
    (wd as any).metadata = { ...(wd as any).metadata, user_cancelled_at: new Date().toISOString() };
    await wd.save();
    return res.status(200).json({ ok: true, status: wd.status });
  } catch (e) {
    return res.status(500).json({ error: 'Cancel error' });
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

// Admin-only: reconcile NOWPayments pending payouts by polling provider
export const reconcileNowpaymentsPayouts: RequestHandler = async (req, res) => {
  try {
    const limit = Math.max(1, Math.min(100, Number(req.query.limit) || 20));
    const items = await Withdrawal.find({ provider: 'nowpayments', status: { $in: ['processing','approved'] } }).sort({ created_at: 1 }).limit(limit);
    const results: any[] = [];
    for (const wd of items) {
      const ref = wd.provider_ref;
      if (!ref) { results.push({ id: String(wd._id), action: 'skip_no_ref' }); continue; }
      try {
        const info = await getNowPayout(ref);
        const status = String(info?.status || info?.payment_status || '').toLowerCase();
        const confirmed = ['confirmed','finished','completed','paid','success'].includes(status);
        const failed = ['failed','cancelled','rejected','error'].includes(status);
        if (confirmed && wd.status !== 'paid') {
          wd.status = 'paid';
          await wd.save();
          results.push({ id: String(wd._id), provider_ref: ref, status: 'paid' });
        } else if (failed && wd.status !== 'paid') {
          try {
            await userService.updateUserData(wd.user_id, { $inc: { cash_balance: wd.amount } });
            await userService.recordBalanceChange(wd.user_id, wd.amount, 'Withdrawal refund', String(wd._id), 'Withdrawal', 'USDT');
          } catch {}
          wd.status = 'failed';
          await wd.save();
          results.push({ id: String(wd._id), provider_ref: ref, status: 'failed' });
        } else {
          results.push({ id: String(wd._id), provider_ref: ref, status: wd.status });
        }
      } catch (e) {
        results.push({ id: String(wd._id), provider_ref: ref, error: (e as any)?.message || 'fetch_failed' });
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
  listWithdrawals,
  requestWithdrawal,
  cancelWithdrawal,
  quoteDeposit,
  coinpaymentsWebhook,
  nowpaymentsWebhook,
  nowpaymentsPayoutWebhook,
  nowpaymentsWebhookMock,
  faucetCredit,
  reconcileNowpaymentsPending,
  reconcileNowpaymentsPayouts,
  reissueNowpaymentsInvoice,
};
