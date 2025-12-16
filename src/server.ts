import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

// Load .env.local first if it exists (to give it priority)
const localEnvPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(localEnvPath)) {
  dotenv.config({ path: localEnvPath });
}

// Then load main .env file (won't override existing env vars)
dotenv.config();

import cors from 'cors';
import express from 'express';
import bodyParser from 'body-parser';
import morgan from 'morgan';
import mongoose from 'mongoose';
import env from 'env-var';
import http from 'http';
import { Server } from 'socket.io';

// Import MongoDB caching plugin
import './helpers/mongo_cache';

import { chessService, agentService } from './services';
import leaderboardService from './services/leaderboard_service';
import { handleValidationError } from './validation';
import { streamLoop } from './websockets/lichess_stream';
import {
  authRouter, chessRouter, wagerRouter, leaderboardRouter, lichessRouter,
  analysisRouter, internalRouter, raffleRouter, logRouter, twitterRouter, billingRouter,
  realMarketsRouter,
  adminRouter,
  matchesRouter,
} from './routers';

import * as constants from './helpers/constants';
import { chessWS } from './websockets';
import logger from './helpers/axiom_logger';
import { getVersionInfo } from './helpers/version';
// Ensure global type augmentations are included for type-checking only
import type {} from './types/global';


// Record server start time for detecting fresh deployments
(global as any).serverStartTime = Date.now();

// initialize
const app = express();
// Trust the Heroku proxy to get correct client IP addresses for rate limiting
app.set('trust proxy', 1);
const httpServer = http.createServer(app);

// Define allowed origins for both CORS and Socket.IO
const allowedOrigins = process.env.NODE_ENV === 'production'
  ? ['https://betmate-prod.netlify.app', 'https://betmate-dev.netlify.app']
  : ['http://localhost:3000', 'http://localhost:8000', 'http://localhost:8080'];

// Log the allowed origins (debug-level)
logger.log({ level: 'debug', event: 'startup_cors', context: { allowedOrigins } });

// Enable CORS with allowed origins
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  // Allow admin header for in-app ops panel
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Admin-Key', 'x-admin-key'],
}));

// Setup Socket.IO with allowed origins
const io = new Server(httpServer, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST'],
    credentials: true
  }
});

// Set limits for request body
// Capture raw body for HMAC verification on provider webhooks
app.use(bodyParser.json({
  limit: '5mb',
  verify: (req: any, _res, buf) => { req.rawBody = buf?.toString?.('utf8') || ''; }
}));
app.use(bodyParser.urlencoded({
  limit: '5mb', extended: true,
  verify: (req: any, _res, buf) => { req.rawBody = buf?.toString?.('utf8') || ''; }
}));

// Setup common HTTP logging (opt-in)
if (process.env.LOG_HTTP_DEBUG === 'true') {
  app.use(morgan('dev'));
}

// Configure rate limiting middleware
import { rateLimit } from 'express-rate-limit';
import opsMetrics from './utils/ops_metrics';
import errorHandler from './middleware/error_handler';
import { axiomLoggerMiddleware } from './middleware/axiom_logger_middleware';

// Enable if in production or if a specific env var is set.
// Apply selectively to avoid throttling core dashboard endpoints like /leaderboard and /wager.
if (process.env.NODE_ENV === 'production' || process.env.ENABLE_RATE_LIMITING === 'true') {
  // Separate limiters so we can attribute counters clearly
  const analysisLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: "Too many requests",
    handler: (req, res, _next, _opts) => {
      opsMetrics.inc('analysis429');
      res.status(429).json({ error: 'Too many requests' });
    },
  });
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: "Too many requests",
    handler: (req, res, _next, _opts) => {
      opsMetrics.inc('auth429');
      res.status(429).json({ error: 'Too many requests' });
    },
  });
  const billingLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: "Too many deposit attempts",
    handler: (req, res, _next, _opts) => {
      opsMetrics.inc('billingIntent429');
      res.status(429).json({ error: 'Too many deposit attempts' });
    },
  });

  // Narrow scope only to heavy or auth endpoints
  app.use('/analysis', analysisLimiter);
  app.use('/auth', authLimiter);
  app.use('/billing/deposit/intent', billingLimiter);
  // Intentional: leaderboard, wager, admin are not behind the limiter
}

// Add Axiom logging middleware
app.use(axiomLoggerMiddleware);

// declare routers
app.use('/auth', authRouter);
app.use('/chess', chessRouter);
app.use('/wager', wagerRouter);
app.use('/leaderboard', leaderboardRouter);
app.use('/analysis', analysisRouter);
app.use('/internal', internalRouter);
app.use('/raffle', raffleRouter);
app.use('/api/log', logRouter); // Frontend logging endpoint
app.use('/api/twitter', twitterRouter); // Twitter integration endpoints
app.use('/billing', billingRouter); // Wallet deposit/withdrawal endpoints (flag‑gated in FE)
app.use('/real/markets', realMarketsRouter); // Real-mode WDL market prices (Phase 1 read-only)
app.use('/admin', adminRouter); // Admin risk endpoints (guarded by X-Admin-Key)
app.use('/matches', matchesRouter); // Featured + match details endpoints for FE card redesign

// declare websockets
const chessWebsocket = io.of('/chessws');
chessWebsocket.on('connection', chessWS);

app.use('/lichess', lichessRouter(chessWebsocket));

// Root endpoint just returns a welcome message
app.get('/', (req, res) => {
  res.json({
    message: 'BetMate API',
    environment: process.env.NODE_ENV || 'development',
    version: process.env.npm_package_version || '1.0.0',
    status: 'online',
    endpoints: {
      auth: '/auth',
      chess: '/chess',
      wager: '/wager',
      leaderboard: '/leaderboard',
      analysis: '/analysis',
      raffle: '/raffle',
      twitter: '/api/twitter',
      matches: '/matches',
      websocket: '/chessws'
    }
  });
});

// Add an API version endpoint for the frontend to check
app.get('/api/status', async (_req, res) => {
  const v = getVersionInfo();
  // Read feature flags from DB (fallback to env defaults)
  let features: any = {};
  let pricingModelVersion = process.env.PRICING_MODEL_VERSION || 'v0';
  // Risk summary (public) for FE odds display parity with backend acceptance
  // Pull margins, max odds, and confidence knobs only (no bankroll/exposure figures)
  let riskPublic: any = {};
  try {
    const { getFeatures } = require('./utils/features_runtime');
    const f = await getFeatures();
    features = {
      realModeEnabled: !!f.realModeEnabled,
      enableFaucet: !!f.enableFaucet,
      enableRateLimiting: !!f.enableRateLimiting,
    };
    pricingModelVersion = f.pricingModelVersion || pricingModelVersion;
  } catch (_e) {
    const realModeEnabled = (
      process.env.FEATURE_REAL_MODE === 'true'
      || process.env.NODE_ENV === 'development'
    );
    features = {
      realModeEnabled,
      enableFaucet: process.env.ENABLE_FAUCET === 'true',
      enableRateLimiting: (process.env.NODE_ENV === 'production') || (process.env.ENABLE_RATE_LIMITING === 'true'),
    };
  }

  const pricing = { pricingModelVersion };
  const limits = {
    arcadeMaxStakeMove: Number(process.env.ARCADE_MAX_STAKE_MOVE || 25),
    arcadeMaxStakeWdl: Number(process.env.ARCADE_MAX_STAKE_WDL || 50),
    arcadeMoveMargin: Number(process.env.ARCADE_MOVE_MARGIN || 0.08),
    poolRake: Number(process.env.POOL_RAKE || 0.05),
  };

  // Compute public risk summary using helper (safe: no exposure/bankroll)
  try {
    const { getMargins, getConfidence } = require('./helpers/risk_config');
    const m = getMargins();
    const c = getConfidence();
    riskPublic = {
      margins: {
        baseMargin: m.baseMargin,
        drawExtraMargin: m.drawExtraMargin,
        extraMarginLowConf: c.extraMarginLowConf,
      },
      confidence: {
        earlyMoveNum: c.earlyMoveNum,
      },
      maxOdds: m.maxOdds,
    };
  } catch (_err) {
    // leave riskPublic empty on error; FE will fall back to defaults
    riskPublic = {};
  }

  res.json({
    status: 'online',
    version: v.appVersion,
    environment: v.environment,
    build: {
      appVersion: v.appVersion,
      releasedAtISO: v.releasedAtISO,
      commit: v.commit,
      release: v.release,
    },
    features,
    pricing,
    risk: riskPublic,
    limits,
  });
});

// global error handler - this should be the last middleware
app.use(errorHandler);

// mongoose setup
const MONGODB_URI = env.get('MONGODB_URI').required().asString();
// Add connection options + deprecation flags for Mongoose 5.x
const mongooseOptions = {
  // Driver/connection timeouts
  serverSelectionTimeoutMS: 10000,
  connectTimeoutMS: 10000,
  // Silence deprecation warnings on MongoDB driver/Mongoose 5.x
  useNewUrlParser: true,
  useUnifiedTopology: true,
  useFindAndModify: false,
  useCreateIndex: true,
} as any;

// Handle successful MongoDB connection
const connectSuccess = () => {
  logger.log({ level: 'info', event: 'mongo_connected' });
  
  // Axiom logging is initialized automatically on first use

  // Initialize bots (optional via ENABLE_BOTS)
  if (process.env.ENABLE_BOTS === 'true') {
    logger.log({ level: 'info', event: 'bots_init' });
    agentService.initializeBots().catch((error) => {
      logger.log({ level: 'error', event: 'bots_init_error', context: { error: error.message } });
    });
  } else {
    logger.log({ level: 'debug', event: 'bots_disabled' });
  }
  
  // Clean up any stale games left from previous server runs
  if (process.env.NODE_ENV !== 'test') {
    logger.log({ level: 'info', event: 'purge_stale_games_start' });
    (async () => {
      try {
        const result = await (chessService.purgeStaleGames() as any);
        logger.log({ level: 'info', event: 'purge_stale_games_done', context: { result } });
      } catch (error: any) {
        logger.log({ level: 'error', event: 'purge_stale_games_error', context: { error: error?.message || String(error) } });
      } finally {
        // Start listening for Lichess games regardless
        streamLoop(chessWebsocket).catch(console.error);
      }
    })();
  }
};

// Connect to MongoDB with proper error handling
const mongoUri = process.env.MONGODB_URI || '';
const sanitizedUri = mongoUri.replace(/\/\/([^:]+):([^@]+)@/, '//***@');
logger.log({ level: 'debug', event: 'mongo_connecting', context: { uri: sanitizedUri, node_env: process.env.NODE_ENV } });
logger.log({ level: 'debug', event: 'env_presence', context: {
  MONGODB_URI: !!process.env.MONGODB_URI,
  MONGODB_USERNAME: !!process.env.MONGODB_USERNAME,
  MONGODB_PASSWORD: !!process.env.MONGODB_PASSWORD
}});

// Attempt to connect to MongoDB with the URI (async/await to avoid TS chaining on void)
(async () => {
  try {
    await mongoose.connect(mongoUri, mongooseOptions as any);
    connectSuccess();
  } catch (error: any) {
    logger.log({ level: 'error', event: 'mongo_connect_error', context: { error: error?.message || String(error) } });
    if (mongoUri.includes('mongodb+srv')) {
      try {
        const formattedUri = constructSrvUri(mongoUri);
        logger.log({ level: 'debug', event: 'mongo_uri_reformat_attempt' });
        await mongoose.connect(formattedUri, mongooseOptions as any);
        connectSuccess();
      } catch (err: any) {
        logger.log({ level: 'error', event: 'mongo_connect_error_reformatted', context: { error: err?.message || String(err) } });
        process.exit(1);
      }
    } else {
      process.exit(1);
    }
  }
})();

/**
 * Construct a properly formatted SRV URI with credentials
 */
function constructSrvUri(mongoUri) {
  try {
    // Better approach: use the URL constructor to parse the URI
    const mongoUrl = new URL(mongoUri);
    
    // Get just the hostname and pathname (and search params if any)
    const hostname = mongoUrl.hostname; // e.g., betmate-prod.rb3qn.mongodb.net
    const pathname = mongoUrl.pathname; // e.g., /betmate
    const searchParams = mongoUrl.search; // e.g., ?retryWrites=true&w=majority
    
    // Get username and password from environment or URL
    const username = process.env.MONGODB_USERNAME || mongoUrl.username;
    const password = process.env.MONGODB_PASSWORD || mongoUrl.password;
    
    if (!username || !password) {
      throw new Error('MongoDB username or password missing');
    }
    
    // Construct the URL with proper encoding
    const encodedUsername = encodeURIComponent(username);
    const encodedPassword = encodeURIComponent(password);
    
    // Build SRV URI with proper format
    return `mongodb+srv://${encodedUsername}:${encodedPassword}@${hostname}${pathname}${searchParams}`;
  } catch (error) {
    console.error('Failed to parse MongoDB URI:', error.message);
    throw error;
  }
}

// Start the server
const port = process.env.PORT || 9000;
httpServer.listen(port, () => {
  const v = getVersionInfo();
  logger.log({
    level: 'info',
    event: 'startup',
    context: {
      port,
      appVersion: v.appVersion,
      environment: v.environment,
      release: v.release,
      releasedAtISO: v.releasedAtISO,
      commit: v.commit,
    }
  });
});

export { app, httpServer };
