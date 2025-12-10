import axios from 'axios';

const API_BASE = 'https://api.commerce.coinbase.com';

type CreateChargeInput = {
  name: string;
  description?: string;
  pricing_type?: 'fixed_price' | 'no_price';
  local_price?: { amount: string; currency: string };
  metadata?: Record<string, any>;
  redirect_url?: string;
  cancel_url?: string;
};

export interface CreateChargeResult {
  id: string;
  hosted_url: string;
}

export async function createCharge(input: CreateChargeInput): Promise<CreateChargeResult> {
  const apiKey = process.env.COINBASE_COMMERCE_KEY;
  if (!apiKey) {
    // Stubbed fallback in dev without keys
    return { id: 'stub-charge', hosted_url: '#' };
  }
  const res = await axios.post(`${API_BASE}/charges`, { ...input }, {
    headers: {
      'X-CC-Api-Key': apiKey,
      'X-CC-Version': '2018-03-22',
    },
    timeout: 10000,
  });
  const data = res?.data?.data;
  return { id: data?.id, hosted_url: data?.hosted_url } as CreateChargeResult;
}

export function verifyWebhookSignature(_rawBody: string, _signature: string): boolean {
  // For MVP, stub verification behind env: require secret to be set to enforce
  const secret = process.env.COINBASE_COMMERCE_WEBHOOK_SECRET;
  if (!secret) {
    // Without a secret configured, reject to avoid accidental acceptance
    return false;
  }
  // TODO: Implement HMAC SHA256 verification of header 'X-CC-Webhook-Signature'
  return false;
}

