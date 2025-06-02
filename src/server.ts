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

// Log the allowed origins
console.log('🌐 CORS allowed origins:', allowedOrigins);

// Configure Socket.IO with CORS settings
const io = new Server(httpServer, {
  cors: {
    origin: process.env.NODE_ENV === 'production' ? allowedOrigins : '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token']
  },
  allowEIO3: true, // Allow Engine.IO version 3 client connections
  transports: ['websocket', 'polling'] // Enable both WebSocket and polling transports
});

// Configure CORS with more secure options
app.use(cors({
  origin: process.env.NODE_ENV === 'production' ? allowedOrigins : '*',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token'],
  exposedHeaders: ['Content-Length', 'X-Requested-With', 'Access-Control-Allow-Origin'],
  preflightContinue: false,
  optionsSuccessStatus: 204
}));

// Add a specific OPTIONS handler to ensure preflight requests work properly
app.options('*', cors({
  origin: process.env.NODE_ENV === 'production' ? allowedOrigins : '*',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token'],
  maxAge: 86400 // Cache preflight response for 24 hours
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

// Set CORS headers for all responses
app.use((req, res, next) => {
  // Add CORS headers to every response for better compatibility
  const origin = req.headers.origin;
  
  // For production, only allow specific origins; otherwise allow any origin
  if (process.env.NODE_ENV === 'production') {
    if (origin && allowedOrigins.includes(origin)) {
      res.header('Access-Control-Allow-Origin', origin);
    }
  } else {
    res.header('Access-Control-Allow-Origin', '*');
  }
  
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, X-CSRF-Token');
  res.header('Access-Control-Allow-Credentials', 'true');
  
  // Handle preflight OPTIONS requests
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
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
app.use('/api/log', logRouter); // Frontend logging endpoint

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
  res.status(200).json({
    message: 'Welcome to the Betmate API',
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
      websocket: '/chessws'
    }
  });
});

// Add an API version endpoint for the frontend to check
app.get('/api/status', (req, res) => {
  res.status(200).json({
    status: 'online',
    environment: process.env.NODE_ENV || 'development',
    version: process.env.npm_package_version || '1.0.0',
    timestamp: new Date().toISOString()
  });
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

// Log environment variables availability (no values, just presence)
console.log('Environment variables availability:');
console.log('- MONGODB_URI:', !!process.env.MONGODB_URI);
console.log('- MONGODB_USERNAME:', !!process.env.MONGODB_USERNAME);
console.log('- MONGODB_PASSWORD:', !!process.env.MONGODB_PASSWORD);

// Try connecting with the provided URI first
connectWithUri(mongoUri);

/**
 * Attempt to connect using the provided URI
 */
function connectWithUri(uri) {
  // Check if we're in production and separate credentials are available
  if (process.env.NODE_ENV === 'production' && 
      process.env.MONGODB_USERNAME && 
      process.env.MONGODB_PASSWORD) {
    
    try {
      // Handle MongoDB+SRV format special case for MongoDB Atlas
      if (uri.startsWith('mongodb+srv://')) {
        let newUri = constructSrvUri(uri);
        console.log('🔄 Using separate credentials from environment variables for SRV connection');
        logSafeUri(newUri);
        
        mongoose.connect(newUri, mongooseOptions)
          .then(connectSuccess)
          .catch(connectError);
      } else {
        // Standard MongoDB URI
        const parsedUri = new URL(uri);
        parsedUri.username = encodeURIComponent(process.env.MONGODB_USERNAME);
        parsedUri.password = encodeURIComponent(process.env.MONGODB_PASSWORD);
        const newUri = parsedUri.toString();
        
        console.log('🔄 Using separate credentials from environment variables');
        logSafeUri(newUri);
        
        mongoose.connect(newUri, mongooseOptions)
          .then(connectSuccess)
          .catch(connectError);
      }
    } catch (error) {
      console.error('❌ Error constructing MongoDB URI:', error);
      // Fall back to original URI
      mongoose.connect(uri, mongooseOptions)
        .then(connectSuccess)
        .catch(connectError);
    }
  } else {
    // Use the original URI directly
    mongoose.connect(uri, mongooseOptions)
      .then(connectSuccess)
      .catch(connectError);
  }
}

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
    const search = mongoUrl.search;    // e.g., ?retryWrites=true&w=majority
    
    // Construct the host and path correctly
    const hostAndPath = hostname + pathname + search;
    
    // Reconstruct the URI with the new credentials
    return `mongodb+srv://${encodeURIComponent(process.env.MONGODB_USERNAME)}:${encodeURIComponent(process.env.MONGODB_PASSWORD)}@${hostAndPath}`;
  } catch (urlError) {
    // Fallback to manual parsing if URL constructor fails
    console.log('⚠️ URL parsing failed, using manual extraction', urlError.message);
    
    // Extract the host and everything after it
    let hostAndPath;
    if (mongoUri.includes('@')) {
      // If URI already has auth info, extract what's after the @
      hostAndPath = mongoUri.split('@')[1];
    } else {
      // If no auth info, extract what's after mongodb+srv://
      hostAndPath = mongoUri.substring('mongodb+srv://'.length);
    }
    
    // Reconstruct the URI with the new credentials
    return `mongodb+srv://${encodeURIComponent(process.env.MONGODB_USERNAME)}:${encodeURIComponent(process.env.MONGODB_PASSWORD)}@${hostAndPath}`;
  }
}

/**
 * Log a safe version of the URI (without credentials)
 */
function logSafeUri(uri) {
  try {
    // Create a safe version of the URI for logging (no credentials)
    const urlObj = new URL(uri);
    urlObj.username = '***';
    urlObj.password = '***';
    const safeUri = urlObj.toString();
    
    // Additional validation check for the URI format
    const protocol = urlObj.protocol;
    const hostname = urlObj.hostname;
    
    console.log('🔍 URI validation check:');
    console.log('- Protocol:', protocol);
    console.log('- Hostname:', hostname);
    
    // Check if hostname is valid
    if (!hostname || hostname.includes(':')) {
      console.warn('⚠️ Potential issue with hostname format:', hostname);
    }
    
    console.log('🔄 New connection string (safe):', safeUri);
  } catch (err) {
    // In case of URL parsing errors, do manual sanitization
    const safeUri = uri.replace(/\/\/([^:]+):([^@]+)@/, '//***:***@');
    console.error('⚠️ Error parsing the URI for logging:', err.message);
    console.log('🔄 New connection string (safe):', safeUri);
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
  
  // Check for common MongoDB connection errors and provide more helpful diagnostics
  if (err.message.includes('bad auth')) {
    console.error('🔑 Authentication failed: The username or password is incorrect');
  } else if (err.message.includes('ECONNREFUSED')) {
    console.error('🔌 Connection refused: MongoDB server may be down or the URI is incorrect');
  } else if (err.message.includes('invalid hostname')) {
    console.error('🌐 Invalid hostname: The MongoDB URI contains an invalid hostname');
  } else if (err.message.includes('No hostname found in URI')) {
    console.error('⚠️ Invalid URI format: MongoDB URI must contain a hostname');
  } else if (err.message.includes('Unescaped colon in authority section')) {
    console.error('⚠️ URI formatting error: Special characters in username/password need URL encoding');
    console.error('🔧 Make sure MONGODB_USERNAME and MONGODB_PASSWORD are properly URL-encoded');
  }
  
  // Log more detailed error information in a structured way
  const errorInfo = {
    code: err.code,
    codeName: err.codeName,
    name: err.name,
    stack: err.stack?.split('\n')[0] || 'No stack trace',
    // Add diagnostics based on the error message
    possibleCause: getPossibleCause(err.message)
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
  
  // Show environment info to help diagnose the issue
  if (process.env.NODE_ENV === 'production') {
    console.log('📊 Environment context:');
    console.log('- NODE_ENV:', process.env.NODE_ENV);
    console.log('- MONGODB_URI exists:', !!process.env.MONGODB_URI);
    console.log('- MONGODB_USERNAME exists:', !!process.env.MONGODB_USERNAME);
    console.log('- MONGODB_PASSWORD exists:', !!process.env.MONGODB_PASSWORD);
    console.log('- Is SRV connection:', process.env.MONGODB_URI?.startsWith('mongodb+srv://') || false);
  }
  
  // Exit with failure in production, but allow development to continue
  if (process.env.NODE_ENV === 'production') {
    console.error('💥 Exiting due to database connection failure in production');
    process.exit(1);
  } else {
    console.warn('⚠️ Continuing without database in development mode');
  }
}

// Helper function to identify possible causes from error messages
function getPossibleCause(errorMessage) {
  if (errorMessage.includes('bad auth')) {
    return 'Invalid credentials (username/password)';
  } else if (errorMessage.includes('ECONNREFUSED')) {
    return 'MongoDB server unreachable or wrong connection string';
  } else if (errorMessage.includes('invalid hostname') || errorMessage.includes('No hostname')) {
    return 'Malformed connection string (invalid hostname)';
  } else if (errorMessage.includes('Unescaped colon')) {
    return 'Username or password contains special characters that need URL encoding';
  } else if (errorMessage.includes('timed out')) {
    return 'Network connectivity issues or firewall blocking connection';
  } else {
    return 'Unknown connection issue';
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