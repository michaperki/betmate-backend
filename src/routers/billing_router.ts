import bodyParser from 'body-parser';
import express from 'express';
import { requireAuth, requireAdminKey } from '../authentication';
import billingController from '../controllers/billing_controller';

const router = express();
// Create deposit intent (authenticated)
router.post('/deposit/intent', bodyParser.json(), requireAuth, billingController.createDepositIntent);

// List user deposits
router.get('/deposits', requireAuth, billingController.listDeposits);
// Quote deposit (auth): returns charge USD incl. fees and estimated crypto amount
router.get('/quote', requireAuth, billingController.quoteDeposit);

// CoinPayments IPN — HMAC verified using raw body (captured in server.ts)
router.post('/webhook/coinpayments', billingController.coinpaymentsWebhook);

// NOWPayments webhook — HMAC verified using raw body (captured in server.ts)
router.post('/webhook/nowpayments', billingController.nowpaymentsWebhook);

// Dev-only mock webhook for NOWPayments
router.post('/webhook/nowpayments/mock', billingController.nowpaymentsWebhookMock);

// Faucet (dev/staging only): credit real balance for testing
router.post('/faucet', requireAuth, billingController.faucetCredit);

// Admin-only operational helpers (remove/disable for prod as needed)
router.post('/reconcile/nowpayments', requireAdminKey, billingController.reconcileNowpaymentsPending);
router.post('/reissue/nowpayments/:id', requireAdminKey, billingController.reissueNowpaymentsInvoice);

export default router;
