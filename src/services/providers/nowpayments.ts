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

// In many cases, a hosted checkout URL is only returned by the Invoice API.
type CreateInvoiceInput = CreatePaymentInput;
export interface CreateInvoiceResult { id: string; invoice_url: string; }

export async function createInvoice(input: CreateInvoiceInput): Promise<CreateInvoiceResult> {
  const apiKey = process.env.NOWPAYMENTS_API_KEY;
  if (!apiKey) {
    return { id: 'stub-invoice', invoice_url: '#' };
  }
  const res = await axios.post(`${API_BASE}/invoice`, { ...input }, {
    headers: { 'x-api-key': apiKey },
    timeout: 15000,
  });
  const data = res?.data || {};
  const id = data?.id || data?.invoice_id || 'unknown';
  const url = data?.invoice_url || data?.payment_url || '#';
  return { id: String(id), invoice_url: String(url) } as CreateInvoiceResult;
}

export async function estimatePayAmountUSD(amountUSD: number, payCurrency: string): Promise<{ pay_amount: number }> {
  const apiKey = process.env.NOWPAYMENTS_API_KEY;
  if (!apiKey) return { pay_amount: 0 };
  const params = new URLSearchParams({ amount: String(amountUSD), currency_from: 'usd', currency_to: String(payCurrency) });
  const res = await axios.get(`${API_BASE}/estimate?${params.toString()}`, {
    headers: { 'x-api-key': apiKey },
    timeout: 10000,
  });
  const data = res?.data || {};
  const est = Number(data?.estimated_amount || data?.amount || 0);
  return { pay_amount: Number.isFinite(est) ? est : 0 };
}
