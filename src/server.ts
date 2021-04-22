import cors from 'cors';
import express from 'express';
import bodyParser from 'body-parser';
import morgan from 'morgan';
import mongoose from 'mongoose';
import env from 'env-var';
import http from 'http';
import dotenv from 'dotenv';
import { Server } from 'socket.io';

import {
  authRouter, userRouter, chessRouter, wagerRouter,
} from './routers';

import * as constants from './helpers/constants';
import { chessWS } from './websockets';

dotenv.config();

// initialize
const app = express();
const httpServer = http.createServer(app);
const io = new Server(httpServer);

// enable/disable cross origin resource sharing if necessary
app.use(cors());

// enable/disable http request logging
if (process.env.NODE_ENV !== 'test') app.use(morgan('dev'));

// enable json message body for posting data to API
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// declare routers
app.use('/auth', authRouter); // NOTE: Not secured
app.use('/users', userRouter); // NOTE: Completely secured to users
app.use('/chess', chessRouter);
app.use('/wager', wagerRouter);

// declare websockets
const chessWebsocket = io.of('/chessws');
chessWebsocket.on('connection', chessWS);

// setInterval(() => {
//   console.log('starting new game');
//   chessWebsocket.to('asdf').emit('new_game', 'starting game');
// }, 3000);

// default index route
app.get('/', (req, res) => {
  // For testing
  res.sendFile(`${__dirname}/index.html`);
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
    // eslint-disable-next-line no-console
    console.info('Connected to Database');
  }
}).catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Not Connected to Database - ERROR! ', err);
});

// Custom 404 middleware
app.use((req, res) => {
  res.status(404).json({ message: 'The route you\'ve requested doesn\'t exist' });
});

// Set mongoose promise to JS promise
mongoose.Promise = global.Promise;

// START THE SERVER
// =============================================================================
const server = httpServer.listen(constants.PORT);
// eslint-disable-next-line no-console
if (process.env.NODE_ENV !== 'test') console.log(`listening on: ${constants.PORT}`);
export default server;
