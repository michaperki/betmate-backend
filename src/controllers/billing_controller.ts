import { RequestHandler } from 'express';
import { ValidatedRequestWithJWT } from '../types/requests';
import { Users, Deposit, BalanceHistory } from '../models';
import { createCharge } from '../services/providers/coinbase_commerce';

export const createDepositIntent: RequestHandler = async (req: ValidatedRequestWithJWT<any>, res) => {
  try {
    const { amount, currency = 'USDT' } = req.body || {};
    const num = Number(amount);
    if (!Number.isFinite(num) || num <= 0) {
      return res.status(400).json({ error: 'Invalid amount' });
    }
    // Create provider charge (hosted_url)
    const charge = await createCharge({
      name: `BetMate Deposit (${currency})`,
      pricing_type: 'fixed_price',
      local_price: { amount: String(num), currency: 'USD' },
      metadata: { user_id: String(req.user._id), currency },
    });

    // Persist deposit (pending)
    const dep = await new Deposit({
      user_id: req.user._id,
      amount: num,
      currency,
      provider: 'coinbase',
      provider_ref: charge.id,
      status: 'pending',
    }).save();

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
export const providerWebhook: RequestHandler = async (req, res) => {
  try {
    // We will implement signature verification before enabling this in prod
    return res.status(501).json({ error: 'Webhook verification not implemented yet' });
  } catch (e) {
    return res.status(500).json({ error: 'Webhook error' });
  }
};

export default {
  createDepositIntent,
  listDeposits,
  providerWebhook,
};

