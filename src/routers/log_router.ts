import { Router } from 'express';
import cors from 'cors';
import { logController } from '../controllers';
import rateLimit from 'express-rate-limit';

const router = Router();

// Define allowed origins for the log endpoint
const allowedOrigins = process.env.NODE_ENV === 'production'
  ? ['https://betmate-prod.netlify.app', 'https://betmate-dev.netlify.app']
  : ['http://localhost:3000', 'http://localhost:8000', 'http://localhost:8080'];

// Apply specific CORS settings for this route
const logCorsOptions = {
  origin: process.env.NODE_ENV === 'production' ? allowedOrigins : '*',
  credentials: true,
  methods: ['POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  maxAge: 86400 // Cache preflight for 24 hours
};

// Apply a modest rate limit specifically to the client log proxy
const logLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60, // 60 log events per minute per IP
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * POST /api/log
 *
 * Endpoint for frontend to send logs to Axiom
 * Acts as a proxy to avoid exposing Axiom API key to client
 */
router.options('/', cors(logCorsOptions)); // Handle OPTIONS preflight
router.post('/', logLimiter, cors(logCorsOptions), logController.clientLogRequest);

// Add a fallback handler for other methods to prevent 404s
router.all('/', (req, res) => {
  res.status(405).json({ message: 'Method not allowed. Use POST to send logs.' });
});

export default router;
