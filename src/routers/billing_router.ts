import bodyParser from 'body-parser';
import express from 'express';
import { requireAuth } from '../authentication';
import billingController from '../controllers/billing_controller';
import bodyParserRaw from 'body-parser';

const router = express();
// JSON body
router.use(bodyParser.json());

// Create deposit intent (authenticated)
router.post('/deposit/intent', requireAuth, billingController.createDepositIntent);

// List user deposits
router.get('/deposits', requireAuth, billingController.listDeposits);

// CoinPayments IPN needs raw body for HMAC
router.post('/webhook/coinpayments', bodyParserRaw.raw({ type: '*/*' }), (req: any, _res, next) => {
  req.rawBody = req.body?.toString?.() || req.rawBody || '';
  try { req.body = JSON.parse(req.rawBody); } catch { /* leave raw */ }
  next();
}, billingController.coinpaymentsWebhook);

// NOWPayments webhook (raw body for signature)
router.post('/webhook/nowpayments', bodyParserRaw.raw({ type: '*/*' }), (req: any, _res, next) => {
  req.rawBody = req.body?.toString?.() || req.rawBody || '';
  try { req.body = JSON.parse(req.rawBody); } catch { /* leave raw */ }
  next();
}, billingController.nowpaymentsWebhook);

// Dev-only mock webhook for NOWPayments
router.post('/webhook/nowpayments/mock', billingController.nowpaymentsWebhookMock);

export default router;
