import bodyParser from 'body-parser';
import express from 'express';
import { createValidator } from 'express-joi-validation';
import { requireAuth } from '../authentication';
import billingController from '../controllers/billing_controller';

const router = express();
const validator = createValidator({ passError: true });

// JSON body
router.use(bodyParser.json());

// Create deposit intent (authenticated)
router.post('/deposit/intent', requireAuth, billingController.createDepositIntent);

// List user deposits
router.get('/deposits', requireAuth, billingController.listDeposits);

// Provider webhook stub (no auth; signature verification TBD)
router.post('/webhook', billingController.providerWebhook);

export default router;

