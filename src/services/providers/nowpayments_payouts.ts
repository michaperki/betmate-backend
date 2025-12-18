import axios from 'axios';

const API_BASE = 'https://api.nowpayments.io/v1';

export interface CreatePayoutInput {
  amount_usd: number;
  pay_currency: string; // e.g., USDTTRC20, USDTERC20, USDC, BTC, ETH
  address: string;
  ipn_callback_url?: string;
  withdrawal_id?: string; // internal reference
}

export interface CreatePayoutResult {
  payout_id: string;
  status: string;
}

export async function createPayout(input: CreatePayoutInput): Promise<CreatePayoutResult> {
  const apiKey = process.env.NOWPAYMENTS_API_KEY;
  if (!apiKey) {
    // Stub for dev when no credentials are configured
    return { payout_id: `stub-payout-${Date.now()}`, status: 'processing' };
  }
  // NOWPayments payout API expects amount + currency + address; include optional IPN
  // The exact payload shape may vary; we use a conservative structure aligned with Invoice/Payment.
  const payload: any = {
    payout_currency: input.pay_currency,
    payout_address: input.address,
    amount: input.amount_usd,
    ipn_callback_url: input.ipn_callback_url,
    // Attach internal reference if supported
    withdrawal_id: input.withdrawal_id,
  };
  const res = await axios.post(`${API_BASE}/payout`, payload, {
    headers: { 'x-api-key': apiKey },
    timeout: 15000,
  });
  const data = res?.data || {};
  const id = data?.id || data?.payout_id || data?.batch_id || 'unknown';
  const status = data?.status || 'processing';
  return { payout_id: String(id), status: String(status) };
}

export async function getPayout(payoutId: string): Promise<any> {
  const apiKey = process.env.NOWPAYMENTS_API_KEY;
  if (!apiKey) throw new Error('NOWPAYMENTS_API_KEY missing');
  const res = await axios.get(`${API_BASE}/payout/${encodeURIComponent(payoutId)}`, {
    headers: { 'x-api-key': apiKey },
    timeout: 15000,
  });
  return res?.data || {};
}

