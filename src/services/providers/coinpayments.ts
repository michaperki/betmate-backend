import axios from 'axios';
import crypto from 'crypto';

const API_URL = 'https://www.coinpayments.net/api.php';

type CreateTxInput = {
  amount: number; // in currency1
  currency1: string; // e.g., 'USDT'
  currency2: string; // e.g., 'USDT'
  buyer_email?: string;
  item_name?: string;
  ipn_url?: string;
};

export interface CreateTxResult { checkout_url: string; txn_id: string; }

export async function createTransaction(input: CreateTxInput): Promise<CreateTxResult> {
  const publicKey = process.env.COINPAYMENTS_PUBLIC_KEY;
  const privateKey = process.env.COINPAYMENTS_PRIVATE_KEY;
  if (!publicKey || !privateKey) {
    return { checkout_url: '#', txn_id: 'stub-txn' };
  }
  const form = new URLSearchParams();
  form.set('version', '1');
  form.set('key', publicKey);
  form.set('cmd', 'create_transaction');
  form.set('amount', String(input.amount));
  form.set('currency1', input.currency1);
  form.set('currency2', input.currency2);
  if (input.buyer_email) form.set('buyer_email', input.buyer_email);
  if (input.item_name) form.set('item_name', input.item_name);
  if (input.ipn_url) form.set('ipn_url', input.ipn_url);

  const hmac = crypto.createHmac('sha512', privateKey).update(form.toString()).digest('hex');
  const res = await axios.post(API_URL, form.toString(), {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'HMAC': hmac,
    },
    timeout: 10000,
  });
  const body = res?.data || {};
  if (body.error && body.error !== 'ok') throw new Error(body.error);
  const result = body.result || {};
  return { checkout_url: result.checkout_url, txn_id: result.txn_id } as CreateTxResult;
}

export function verifyIPN(rawBody: string, hmacHeader: string | undefined): boolean {
  const ipnSecret = process.env.COINPAYMENTS_IPN_SECRET;
  if (!ipnSecret || !hmacHeader) return false;
  const computed = crypto.createHmac('sha512', ipnSecret).update(rawBody).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(hmacHeader));
}

