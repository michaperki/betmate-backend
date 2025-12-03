# Betmate Backend

Server for broadcasting chess matches and live gambling on said matches. Works in conjunction with a machine learning microservice.

Link to [microservice](https://github.com/dali-lab/betmate-model-microservice)

Link to [frontend client](https://github.com/dali-lab/betmate-frontend)

## Architecture

The server is written in [TypeScript](https://www.typescriptlang.org/), and it uses the [Node.js](https://nodejs.org/en/) runtime and [Express](https://expressjs.com/) framework. [Mongoose](https://mongoosejs.com/) is used to interface with our [MongoDB](https://www.mongodb.com/) database. To manage broadcasts and live data updates, Socket.IO is used. Chess logic is managed through [chess.js](https://github.com/jhlywa/chess.js). Endpoints are secured with [Passport.js](http://www.passportjs.org/) and [express-validator](https://express-validator.github.io/docs/) for authentication and validation, respectively.

## Setup

### Local Development

You must have `Node.js` and `Yarn` installed to run this project

1. Clone this repository
2. In the console, run `yarn`
3. Add a `.env` file to setup `AUTH_SECRET`, `MONGODB_URI`, and `MICROSERVICE_API_KEY`
    - `AUTH_SECRET` can be any string
    - `MONGODB_URI` is formatted as "mongodb://localhost:27017/\<dbname>" ([documentation](https://docs.mongodb.com/manual/reference/connection-string/))
    - `MICROSERVICE_API_KEY` is provided in the handoff doc
4. Run `yarn dev`

If you also want to run the microservice locally, follow the setup instructions in the [microservice README](https://github.com/dali-lab/betmate-model-microservice) and change line 11 in `src/helpers/constants.ts` accordingly.

### Logging configuration

The backend logger supports a few env vars to trim noisy local output:

- `LOG_LEVEL` (`debug`, `info`, `warn`, `error`): defaults to `info` in development and `warn` elsewhere. Only logs at or above this level are emitted.
- `LOG_HTTP`: set to `true`, `1`, or `debug` to include successful HTTP request logs; errors and slow requests are always logged.
- `ENABLE_AXIOM_LOGGING`: still opt-in outside production; set to `true` when you want to test Axiom ingestion with a valid API key.

### Heroku Deployment

To deploy the backend to Heroku:

1. Create a new Heroku app:
   ```
   heroku create my-app-name
   ```

2. Add a MongoDB add-on to your Heroku app:
   ```
   heroku addons:create mongolab
   ```

3. Set the required environment variables:
   ```
   heroku config:set AUTH_SECRET=your_secret_key
   heroku config:set MICROSERVICE_URL=your_microservice_url
   heroku config:set MICROSERVICE_API_KEY=your_microservice_api_key
   ```

4. Deploy to Heroku:
   ```
   git push heroku feature/heroku-deployment:main
   ```

5. Check the logs to ensure everything is working:
   ```
   heroku logs --tail
   ```

Note: Heroku automatically sets the `PORT` and `MONGODB_URI` environment variables, so you don't need to configure those manually.

## Testing

Run `yarn test`.

## Repository Structure

```
├── README.md
├── __jest__ # code relevant to Jest testing
├── jest-mongodb-config.js # Jest configuration for mongodb
├── jest.config.js # Jest configuration more generally
├── tsconfig.json # TypeScript config
├── .eslintrc.json # ESLint config
├── package.json
├── src
│   ├── assets # static files
│   ├── authentication # authentication middleware and mocks
│   ├── controllers # all controllers
│   ├── helpers # helper files
│   │   ├── __tests__ # test files
│   │   ├── validation # validation middleware
│   │   ├── chess_logic.ts # chess logic not supported by chess.js
│   │   ├── constants.ts
│   │   ├── resolve_bets.ts # processes and resolves wagers
│   │   ├── utils.ts
│   ├── models # all models and model tests
│   ├── routers # all routers and router tests
│   ├── services # microservice and all database interfacing
│   ├── types # all type declarations
│   ├── websockets # all websockets
│   └── server.ts # server driver file
└── yarn.lock
```

## Data Flow

### REST

All HTTP requests come in through the routers defined in `src/routers/`. Each router is hooked up to the main server file (`src/server.ts`). Each request may be prefixed with some middleware functions for authentication and validation purposes.

Each route invokes a controller function declared in `src/controllers/`. Each of the controller functions uses service functions in `src/services` to interface with the database.

The router then sends either the fetched data or an error message back to the client.

Overview of routes found in `src/routers/routes.md`.

### Websockets

Websockets are used to broadcast chess games to clients as well as live updates on wagers.

To ensure data gets broadcasted to the right end users, [Socket.IO rooms](https://socket.io/docs/v3/rooms/) are relied upon. Rooms are a *server-only* concept. That is, clients do not have access to room information, so it is entirely managed on the server side. A client can be placed in multiple rooms, and they will receive events from each room.

In implementation, all spectators of a game will be placed in a corresponding "room" for that game, and all updates to the game will be broadcasted to that room. Similarly, each authenticated users will be placed in their own "room", and all wager updates for that user will be broadcasted to their room.

Events that dictate the data flow of websockets currently revolve around `src/websockets/game_loop.ts`.

Overview of socket events found in `src/websockets/events.md`.

## Additional Documentation

Overview of model schemas: `src/models/schemas.md`

Overview of routes: `src/routers/routes.md`

Overview of general route functionality: `src/routers/README.md`

Overview of websocket events: `src/websockets/events.md`


## Authors

- Jack Keane '22
- Faustino Cortina '21
- Benedict Tedjokusumo '23
