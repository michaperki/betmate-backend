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
  analysisRouter, internalRouter, raffleRouter, logRouter,
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

// Configure Socket.IO with CORS settings
const io = new Server(httpServer, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST'],
    credentials: true
  }
});

// Configure CORS with more secure options
app.use(cors({
  origin: allowedOrigins,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token']
}));

// Custom morgan logger that skips 404 responses
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('dev', {
    skip: (req, res) => res.statusCode === 404
  }));
}

// Set security HTTP headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
});

// Cookie parser is temporarily disabled
// app.use(cookieParser(process.env.AUTH_SECRET));

// Enable json message body for posting data to API
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// declare routers
app.use('/auth', authRouter);
app.use('/chess', chessRouter);
app.use('/wager', wagerRouter);
app.use('/leaderboard', leaderboardRouter);
app.use('/analysis', analysisRouter);
app.use('/internal', internalRouter);
app.use('/raffle', raffleRouter);
app.use('/api/log', logRouter);

// declare websockets
const chessWebsocket = io.of('/chessws');
chessWebsocket.on('connection', chessWS);

app.use('/lichess', lichessRouter(chessWebsocket));

// purge stale games before running game loops
chessService.purgeStaleGames().then(() => {
  // lichess loops
  streamLoop(chessWebsocket);
  setTimeout(() => streamLoop(chessWebsocket), 10000);
});

// generate leaderboard every minute
setInterval(leaderboardService.generateLeaderboard, 60000);
setInterval(() => {
  leaderboardService.clearLeaderboards();
  chessService.clearGames();
}, 7 * 24 * 60 * 60 * 1000);

// Initialize and run bot services
agentService.initializeBots().then(() => {
  logger.log({
    level: 'info',
    event: 'bot_service_initialized'
  });

  // Check and process empty move bars every 5 seconds
  setInterval(() => agentService.processEmptyMoveBars(chessWebsocket), 5000);

  // Setup scheduled bankroll refresh
  agentService.scheduleRefreshBankrolls();
});

// default index route
app.get('/', (req, res) => {
  res.status(200).send('Welcome to the backend');
});

// DB Setup
const mongooseOptions = {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  useCreateIndex: true,
  useFindAndModify: false,
  loggerLevel: 'error',
};

// Connect the database
// Get MongoDB URI from environment variable (Heroku sets MONGODB_URI automatically)
const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/betmate';

// Safely log MongoDB connection without credentials
const sanitizedUri = mongoUri.replace(/\/\/([^:]+):([^@]+)@/, '//***@');
console.log('Connecting to MongoDB...', sanitizedUri);
console.log('NODE_ENV:', process.env.NODE_ENV);

// Check if the URI contains username/password
if (process.env.NODE_ENV === 'production' && mongoUri.includes('@')) {
  // URL already has credentials, use it directly
  mongoose.connect(mongoUri, mongooseOptions)
    .then(connectSuccess)
    .catch(error => {
      console.error('❌ MongoDB connection error with embedded credentials:', error.message);
      
      // If authentication fails, try with separate credentials
      tryWithSeparateCredentials();
    });
} else if (process.env.NODE_ENV === 'production') {
  console.log('⚠️ No credentials found in MongoDB URI, trying separate environment variables');
  tryWithSeparateCredentials();
} else {
  // Non-production environment, connect normally
  mongoose.connect(mongoUri, mongooseOptions)
    .then(connectSuccess)
    .catch(connectError);
}

/**
 * Try to connect with credentials from separate environment variables
 */
function tryWithSeparateCredentials() {
  if (process.env.MONGODB_USERNAME && process.env.MONGODB_PASSWORD) {
    try {
      // Handle MongoDB+SRV format special case
      let newUri = '';
      if (mongoUri.startsWith('mongodb+srv://')) {
        // For SRV records we need to handle them differently
        const parts = mongoUri.split('//')[1].split('/');
        const host = parts[0];
        const dbAndParams = parts.slice(1).join('/');
        
        newUri = `mongodb+srv://${encodeURIComponent(process.env.MONGODB_USERNAME)}:${encodeURIComponent(process.env.MONGODB_PASSWORD)}@${host}/${dbAndParams}`;
      } else {
        // Standard MongoDB URI
        const parsedUri = new URL(mongoUri);
        parsedUri.username = encodeURIComponent(process.env.MONGODB_USERNAME);
        parsedUri.password = encodeURIComponent(process.env.MONGODB_PASSWORD);
        newUri = parsedUri.toString();
      }
      
      console.log('🔄 Using separate credentials from environment variables');
      const sanitizedNewUri = newUri.replace(/\/\/([^:]+):([^@]+)@/, '//***@');
      console.log('🔄 New connection string:', sanitizedNewUri);
      
      // Update the URI with the new one
      mongoose.connect(newUri, mongooseOptions)
        .then(connectSuccess)
        .catch(connectError);
    } catch (error) {
      console.error('❌ Error constructing MongoDB URI:', error);
      // Fall back to original URI if parsing fails
      mongoose.connect(mongoUri, mongooseOptions)
        .then(connectSuccess)
        .catch(connectError);
    }
  } else {
    console.error('❌ No MongoDB credentials available. Set MONGODB_USERNAME and MONGODB_PASSWORD');
    // Fall back to original URI
    mongoose.connect(mongoUri, mongooseOptions)
      .then(connectSuccess)
      .catch(connectError);
  }
}

// Success handler for connection
function connectSuccess() {
  mongoose.Promise = global.Promise; // configures mongoose to use ES6 Promises
  console.log('✅ MongoDB connected successfully');
  if (process.env.NODE_ENV !== 'test') {
    logger.log({
      level: 'info',
      event: 'database_connected',
      context: { uri: sanitizedUri }
    });
  }
}

// Error handler for connection
function connectError(err) {
  console.error('❌ MongoDB connection error:', err.message);
  
  // Log more detailed error information in a structured way
  const errorInfo = {
    code: err.code,
    codeName: err.codeName,
    name: err.name,
    stack: err.stack?.split('\n')[0] || 'No stack trace'
  };
  
  console.error('📋 Error details:', JSON.stringify(errorInfo, null, 2));
  
  logger.log({
    level: 'error',
    event: 'database_connection_failed',
    context: { 
      error: err.message,
      details: errorInfo
    }
  });
  
  // Exit with failure in production, but allow development to continue
  if (process.env.NODE_ENV === 'production') {
    console.error('💥 Exiting due to database connection failure in production');
    process.exit(1);
  } else {
    console.warn('⚠️ Continuing without database in development mode');
  }
}

// Custom 404 middleware
app.use((req, res) => {
  res.status(404).json({ message: 'The route you\'ve requested doesn\'t exist' });
});

// Handle errors raised from validation middleware
app.use(handleValidationError);

// Import and use the global error handler
const errorHandler = require('./middleware/error_handler').default;
app.use(errorHandler);

// Set mongoose promise to JS promise
mongoose.Promise = global.Promise;

// START THE SERVER
// =============================================================================
const server = httpServer.listen(constants.PORT);
if (process.env.NODE_ENV !== 'test') {
  logger.log({
    level: 'info',
    event: 'server_started',
    context: { port: constants.PORT }
  });
}
export default server;