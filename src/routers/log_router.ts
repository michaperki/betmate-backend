import { Router } from 'express';
import { logController } from '../controllers';

const router = Router();

/**
 * POST /api/log
 * 
 * Endpoint for frontend to send logs to Axiom
 * Acts as a proxy to avoid exposing Axiom API key to client
 */
router.post('/', logController.clientLogRequest);

export default router;