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
  analysisRouter, internalRouter, raffleRouter, logRouter, twitterRouter,
} from './routers';

import * as constants from './helpers/constants';
import { chessWS } from './websockets';
import logger from './helpers/axiom_logger';


// initialize
const app = express();
const httpServer = http.createServer(app);

// Define allowed origins for both CORS and Socket.IO
const allowedOrigins = process.env.NODE_ENV === 'production'
  ? ['https://betmate-prod.netlify.app', 'https://betmate-dev.netlify.app']
  : ['http://localhost:3000', 'http://localhost:8000', 'http://localhost:8080'];

// Log the allowed origins
console.log('🌐 CORS allowed origins:', allowedOrigins);

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
  }
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
    max: 100, // limit each IP to 100 requests per windowMs
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
    message: "Too many requests from this IP, please try again after 15 minutes"
  });
  
  // Apply to all requests
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
app.use('/raffle', raffleRouter);
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
      raffle: '/raffle',
      twitter: '/api/twitter',
      websocket: '/chessws'
    }
  });
});

// Add an API version endpoint for the frontend to check
app.get('/api/status', (req, res) => {
  res.json({ 
    status: 'online',
    version: process.env.npm_package_version || '1.0.0',
    environment: process.env.NODE_ENV || 'development'
  });
});

// global error handler - this should be the last middleware
app.use(errorHandler);

// mongoose setup
const MONGODB_URI = env.get('MONGODB_URI').required().asString();
// Add a 10 second timeout for MongoDB connection
const mongooseOptions = { 
  serverSelectionTimeoutMS: 10000,
  connectTimeoutMS: 10000,
};

// Handle successful MongoDB connection
const connectSuccess = () => {
  console.log('✅ MongoDB connected successfully');
  
  // Axiom logging is initialized automatically on first use

  // Initialize bots
  console.log('Checking for existing bots...');
  agentService.initializeBots().catch((error) => {
    console.error('Error initializing bots:', error);
  });
  
  // Start listening for Lichess games if not in test mode
  if (process.env.NODE_ENV !== 'test') {
    streamLoop(chessWebsocket).catch(console.error);
  }
};

// Connect to MongoDB with proper error handling
const mongoUri = process.env.MONGODB_URI || '';
const sanitizedUri = mongoUri.replace(/\/\/([^:]+):([^@]+)@/, '//***@');
console.log('Connecting to MongoDB...', sanitizedUri);
console.log('NODE_ENV:', process.env.NODE_ENV);

// Log environment variables availability (no values, just presence)
console.log('Environment variables availability:');
console.log('- MONGODB_URI:', !!process.env.MONGODB_URI);
console.log('- MONGODB_USERNAME:', !!process.env.MONGODB_USERNAME);
console.log('- MONGODB_PASSWORD:', !!process.env.MONGODB_PASSWORD);

// Attempt to connect to MongoDB with the URI
mongoose.connect(mongoUri, mongooseOptions)
  .then(connectSuccess)
  .catch(error => {
    console.error('❌ MongoDB connection error:', error.message);
    
    // Try constructing the URI differently
    if (mongoUri.includes('mongodb+srv')) {
      try {
        const formattedUri = constructSrvUri(mongoUri);
        console.log('Trying with reformatted URI...');
        
        mongoose.connect(formattedUri, mongooseOptions)
          .then(connectSuccess)
          .catch(err => {
            console.error('❌ MongoDB connection error with reformatted URI:', err.message);
          });
      } catch (error) {
        console.error('❌ Error constructing MongoDB URI:', error);
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
    console.error('Failed to parse MongoDB URI:', error.message);
    throw error;
  }
}

// Start the server
const port = process.env.PORT || 9000;
httpServer.listen(port, () => {
  console.log(`Express server running on port ${port}`);
});

export { app, httpServer };