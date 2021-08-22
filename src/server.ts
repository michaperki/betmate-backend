import cors from 'cors';
import express from 'express';
import bodyParser from 'body-parser';
import morgan from 'morgan';
import mongoose from 'mongoose';
import env from 'env-var';
import http from 'http';
import dotenv from 'dotenv';
import { Server } from 'socket.io';

import { chessService } from 'services';
import leaderboardService from 'services/leaderboard_service';
import { handleValidationError } from 'validation';
import { streamLoop } from 'websockets/lichess_stream';
import {
  authRouter, chessRouter, wagerRouter, leaderboardRouter, lichessRouter,
} from './routers';

import * as constants from './helpers/constants';
import { chessWS } from './websockets';

dotenv.config();

// initialize
const app = express();
const httpServer = http.createServer(app);
const io = new Server(httpServer, { cors: { origin: '*' } });

// enable/disable cross origin resource sharing if necessary
app.use(cors());

// enable/disable http request logging
if (process.env.NODE_ENV !== 'test') app.use(morgan('dev'));

// enable json message body for posting data to API
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// declare routers
app.use('/auth', authRouter);
app.use('/chess', chessRouter);
app.use('/wager', wagerRouter);
app.use('/leaderboard', leaderboardRouter);

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
setInterval(() => leaderboardService.generateLeaderboard(), 60000);

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
mongoose.connect(env.get('MONGODB_URI').required().asString(), mongooseOptions).then(() => {
  mongoose.Promise = global.Promise; // configures mongoose to use ES6 Promises
  if (process.env.NODE_ENV !== 'test') {
    console.info('Connected to Database');
  }
}).catch((err) => {
  console.error('Not Connected to Database - ERROR! ', err);
});

// Custom 404 middleware
app.use((req, res) => {
  res.status(404).json({ message: 'The route you\'ve requested doesn\'t exist' });
});

// Handle errors raised from validation middleware
app.use(handleValidationError);

// Set mongoose promise to JS promise
mongoose.Promise = global.Promise;

// START THE SERVER
// =============================================================================
const server = httpServer.listen(constants.PORT);
if (process.env.NODE_ENV !== 'test') console.log(`listening on: ${constants.PORT}`);
export default server;
