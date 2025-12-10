import axios from 'axios';
import crypto from 'crypto';

const API_BASE = 'https://api.nowpayments.io/v1';

type CreatePaymentInput = {
  price_amount: number;
  price_currency: string;
  pay_currency?: string;
  order_id?: string;
  order_description?: string;
  ipn_callback_url?: string;
  success_url?: string;
  cancel_url?: string;
};

export interface CreatePaymentResult {
  payment_id: string;
  payment_url: string;
}

export async function createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult> {
  const apiKey = process.env.NOWPAYMENTS_API_KEY;
  if (!apiKey) {
    return { payment_id: 'stub-payment', payment_url: '#' };
  }
  const res = await axios.post(`${API_BASE}/payment`, { ...input }, {
    headers: { 'x-api-key': apiKey },
    timeout: 15000,
  });
  const data = res?.data || {};
  const pid = data?.payment_id || data?.id || 'unknown';
  const url = data?.payment_url || data?.invoice_url || '#';
  return { payment_id: String(pid), payment_url: String(url) } as CreatePaymentResult;
}

export function verifyWebhookSignature(rawBody: string, signatureHeader?: string | null): boolean {
  const secret = process.env.NOWPAYMENTS_IPN_SECRET;
  if (!secret || !signatureHeader) return false;
  const computed = crypto.createHmac('sha512', secret).update(rawBody).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(signatureHeader));
  } catch {
    return false;
  }
}

export async function getPayment(paymentId: string): Promise<any> {
  const apiKey = process.env.NOWPAYMENTS_API_KEY;
  if (!apiKey) throw new Error('NOWPAYMENTS_API_KEY missing');
  const res = await axios.get(`${API_BASE}/payment/${encodeURIComponent(paymentId)}`, {
    headers: { 'x-api-key': apiKey },
    timeout: 15000,
  });
  return res?.data || {};
}
