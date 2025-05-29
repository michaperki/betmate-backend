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
const io = new Server(httpServer, { cors: { origin: '*' } });

// enable/disable cross origin resource sharing if necessary
app.use(cors());

// Custom morgan logger that skips 404 responses
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('dev', {
    skip: (req, res) => res.statusCode === 404
  }));
}

// enable json message body for posting data to API
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

mongoose.connect(mongoUri, mongooseOptions).then(() => {
  mongoose.Promise = global.Promise; // configures mongoose to use ES6 Promises
  if (process.env.NODE_ENV !== 'test') {
    logger.log({
      level: 'info',
      event: 'database_connected',
      context: { uri: mongoUri.replace(/\/\/.*@/, '//***@') } // Hide credentials
    });
  }
}).catch((err) => {
  logger.log({
    level: 'error',
    event: 'database_connection_failed',
    context: { error: err.message }
  });
});

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
