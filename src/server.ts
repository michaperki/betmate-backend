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
import { configureMongoose, DEFAULT_MONGOOSE_OPTIONS } from './helpers/mongoose_config';

import { chessService, agentService } from './services';
import leaderboardService from './services/leaderboard_service';
import { handleValidationError } from './validation';
import { streamLoop } from './websockets/lichess_stream';
import {
  authRouter, chessRouter, wagerRouter, leaderboardRouter, lichessRouter,
  analysisRouter, internalRouter, logRouter, twitterRouter,
} from './routers';

import * as constants from './helpers/constants';
import { chessWS } from './websockets';
import logger from './helpers/axiom_logger';
import { logDebug, logInfo, logError } from './helpers/dev_logger';
import { getVersionInfo } from './helpers/version';

// Configure mongoose global options to silence legacy warnings
configureMongoose();

// Record server start time for detecting fresh deployments
// Cast to any to appease ts-node when types are not yet merged
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

// Log the allowed origins
logDebug('🌐 CORS allowed origins:', allowedOrigins);

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
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Setup Socket.IO with allowed origins
const io = new Server(httpServer, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST'],
    credentials: true
  },
  // Prefer WebSocket to avoid HTTP long-poll bursts counted by rate limiter
  transports: ['websocket']
});

// Set limits for request body
app.use(bodyParser.json({ limit: '5mb' }));
app.use(bodyParser.urlencoded({ limit: '5mb', extended: true }));

// Setup common middleware
app.use(morgan('dev')); // logging

// Configure rate limiting middleware
import { rateLimit } from 'express-rate-limit';
import errorHandler from './middleware/error_handler';
import { axiomLoggerMiddleware } from './middleware/axiom_logger_middleware';

// Enable if in production or if a specific env var is set
if (process.env.NODE_ENV === 'production' || process.env.ENABLE_RATE_LIMITING === 'true') {
  const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 1000, // relaxed global cap; use stricter per-route limits as needed
    standardHeaders: true,
    legacyHeaders: false,
    message: 'Too many requests from this IP, please try again after 15 minutes',
    skip: (req) => {
      const p = req.path || '';
      const m = req.method || 'GET';
      // Do not count CORS preflight
      if (m === 'OPTIONS') return true;
      // Exempt auth (routes have their own limiter)
      if (p.startsWith('/auth')) return true;
      // Exempt client logging (route will apply its own limiter)
      if (p.startsWith('/api/log')) return true;
      // Exempt Socket.IO engine and namespace
      if (p.startsWith('/socket.io') || p.startsWith('/chessws')) return true;
      return false;
    }
  });

  // Apply to all requests (with skip rules above)
  app.use(apiLimiter);
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
// Raffles removed
app.use('/api/log', logRouter); // Frontend logging endpoint
app.use('/api/twitter', twitterRouter); // Twitter integration endpoints

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
      twitter: '/api/twitter',
      websocket: '/chessws'
    }
  });
});

// Add an API version endpoint for the frontend to check
app.get('/api/status', (req, res) => {
  const v = getVersionInfo();
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
  });
});

// global error handler - this should be the last middleware
app.use(errorHandler);

// mongoose setup
const MONGODB_URI = env.get('MONGODB_URI').required().asString();
// Add a 10 second timeout for MongoDB connection
const mongooseOptions: mongoose.ConnectOptions = {
  ...DEFAULT_MONGOOSE_OPTIONS,
};

// Handle successful MongoDB connection
const connectSuccess = () => {
  logInfo('✅ MongoDB connected successfully');
  
  // Axiom logging is initialized automatically on first use

  // Initialize bots (optional via ENABLE_BOTS)
  if (process.env.ENABLE_BOTS === 'true') {
    logDebug('Initializing seed bots...');
    agentService.initializeBots().catch((error) => {
      logError('Error initializing bots:', error);
    });
  } else {
    logDebug('Bots disabled (ENABLE_BOTS != "true").');
  }
  
  // Clean up any stale games left from previous server runs
  if (process.env.NODE_ENV !== 'test') {
    logDebug('Purging stale games before starting Lichess stream...');
    chessService.purgeStaleGames()
      .then(result => {
        logInfo(`✅ Stale games purged successfully: ${result}`);
        // Start listening for Lichess games after purging stale games
        streamLoop(chessWebsocket).catch((err) => logError(err));
      })
      .catch(error => {
        logError('❌ Error purging stale games:', error);
        // Continue with Lichess stream anyway
        streamLoop(chessWebsocket).catch((err) => logError(err));
      });
  }
};

// Connect to MongoDB with proper error handling
const mongoUri = process.env.MONGODB_URI || '';
const sanitizedUri = mongoUri.replace(/\/\/([^:]+):([^@]+)@/, '//***@');
logDebug('Connecting to MongoDB...', sanitizedUri);
logDebug('NODE_ENV:', process.env.NODE_ENV);

// Log environment variables availability (no values, just presence)
logDebug('Environment variables availability:');
logDebug('- MONGODB_URI:', !!process.env.MONGODB_URI);
logDebug('- MONGODB_USERNAME:', !!process.env.MONGODB_USERNAME);
logDebug('- MONGODB_PASSWORD:', !!process.env.MONGODB_PASSWORD);

// Attempt to connect to MongoDB with the URI
mongoose.connect(mongoUri, mongooseOptions)
  .then(connectSuccess)
  .catch(error => {
    logError('❌ MongoDB connection error:', error.message);
    
    // Try constructing the URI differently
    if (mongoUri.includes('mongodb+srv')) {
      try {
        const formattedUri = constructSrvUri(mongoUri);
        logDebug('Trying with reformatted URI...');
        
        mongoose.connect(formattedUri, mongooseOptions)
          .then(connectSuccess)
          .catch(err => {
            logError('❌ MongoDB connection error with reformatted URI:', err.message);
          });
      } catch (error) {
        logError('❌ Error constructing MongoDB URI:', error);
        // No more retries, just exit
        process.exit(1);
      }
    } else {
      // Non-SRV URI failed, exit
      process.exit(1);
    }
  });

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
    logError('Failed to parse MongoDB URI:', error.message);
    throw error;
  }
}

// Start the server
const port = process.env.PORT || 9000;
httpServer.listen(port, () => {
  logInfo(`Express server running on port ${port}`);
  const v = getVersionInfo();
  logInfo('Startup version info:', {
    appVersion: v.appVersion,
    environment: v.environment,
    release: v.release,
    releasedAtISO: v.releasedAtISO,
    commit: v.commit,
  });
});

export { app, httpServer };
