# Betmate Backend

Server for broadcasting chess matches and live gambling on said matches. Works in conjunction with a machine learning microservice.

Link to [microservice](https://github.com/dali-lab/betmate-model-microservice)

Link to [frontend client](https://github.com/dali-lab/betmate-frontend)

## Architecture

The server is written in [TypeScript](https://www.typescriptlang.org/), and it uses the [Node.js](https://nodejs.org/en/) runtime and [Express](https://expressjs.com/) framework. [Mongoose](https://mongoosejs.com/) is used to interface with our [MongoDB](https://www.mongodb.com/) database. To manage broadcasts and live data updates, Socket.IO is used. Chess logic is managed through [chess.js](https://github.com/jhlywa/chess.js). Endpoints are secured with [Passport.js](http://www.passportjs.org/) and [express-validator](https://express-validator.github.io/docs/) for authentication and validation, respectively.

## Setup

You must have `Node.js` and `Yarn` installed to run this project

1. Clone this repository
2. In the console, run `yarn`
3. Add a `.env` file to setup `AUTH_SECRET` and `MONGODB_URI`
    - `AUTH_SECRET` can be any string
    - `MONGODB_URI` is formatted as "mongodb://localhost:27017/\<dbname>" ([documentation](https://docs.mongodb.com/manual/reference/connection-string/))
4. Run `yarn dev`

If you also want to run the microservice locally, follow the setup instructions in the [microservice README](https://github.com/dali-lab/betmate-model-microservice) and change line 11 in `src/helpers/constants.ts` accordingly.

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
│   ├── services
│   │   ├── game_loop.ts # broadcasts arbitrary games from src/assets
│   │   ├── microservice.ts # interface with microservice
│   ├── types # all type declarations
│   ├── websockets # all websockets
│   └── server.ts # server driver file
└── yarn.lock
```

## Data Flow

### REST

All HTTP requests come in through the routers defined in `src/routers/`. Each router is hooked up to the main server file (`src/server.ts`). Each request may be prefixed with some middleware functions for authentication and validation purposes.

Each route invokes a controller function declared in `src/controllers/`. Each of the controller functions uses Mongoose to interface with the database.

The router then sends either the fetched data or an error message back to the client.

### Websockets

Websockets are used to broadcast chess games to clients as well as live updates on wagers.

To ensure data gets broadcasted to the right end users, [Socket.IO rooms](https://socket.io/docs/v3/rooms/) are relied upon. Rooms are a *server-only* concept. That is, clients do not have access to room information, so it is entirely managed on the server side. A client can be placed in multiple rooms, and they will receive events from each room.

In implementation, all spectators of a game will be placed in a corresponding "room" for that game, and all updates to the game will be broadcasted to that room. Similarly, each authenticated users will be placed in their own "room", and all wager updates for that user will be broadcasted to their room.

Events that dictate the data flow of websockets currently revolve around `src/services/game_loop.ts`.

## Model Schemas

### Chess

```
├── state
│   ├── type: FEN (String)
│   └── notes: Board state of game. Must be valid FEN.
├── time_format
│   ├── type: String
│   └── notes: Time format of game. First number represents time each player starts with. Second number represents increment in time user gets each turn.
├── game_status
│   ├── type: GameStatus (String)
│   └── notes: Status of game.
├── complete
│   ├── type: Boolean
│   └── notes: Whether or not game is complete, derived from game_status
├── player_white/player_black
│   ├── name
│   │   ├── type: String
│   │   └── notes: Name of player
│   └── elo
│       ├── type: Number
│       └── notes: Elo of player
├── move_hist
│   ├── type: Array
│   └── elements
│       ├── san
│       │   ├── type: SAN (String)
│       │   └── notes: Move is denoted is "standard algebraic notation"
│       ├── time
│       │   ├── type: Number
│       │   └── notes: Time on clock when player made move
│       └── is_white
│           ├── type: Boolean
│           └── notes: Whether the move was white's or black's
├── time_white/time_black
│   ├── type: Number
│   └── notes: Time on clock for respective player
├── odds
│   └── white_win/draw/black_win
│       ├── type: Number
│       └── notes: Probability of respective outcome
└── pool_wagers
    └── move
        ├── options
        │   ├── type: String[]
        │   └── notes: Options for move betting
        └── wagers
            ├── type: Array
            └── elements
                ├── data
                │   ├── type: Data (String)
                │   └── notes: Outcome that is being wagered on
                └── amount
                    ├── type: Number
                    └── notes: Amount wagered
```

### User


```
├── email
│   ├── type: Email (String)
│   └── notes: Email of user
├── password
│   ├── type: String
│   └── notes: Hashed password of user
├── first_name/last_name
│   └── type: String
└── account
    ├── type: Number
    └── notes: Amount of virtual money in user account
```
### Wager

```
├── game_id
│   ├── type: ID
│   └── notes: Corresponds to "Chess" document
├── better_id
│   ├── type: ID
│   └── notes: Corresponds to "User" document
├── wdl
│   ├── type: Boolean
│   └── notes: Signifies if wager is for win/draw/loss or move betting 
├── amount
│   ├── type: Number
│   └── notes: Amount of virtual money put into wager
├── odds
│   ├── type: Number
│   └── notes: Odds of wager
├── data
│   ├── type: String
│   └── notes: The outcome being wagered on
├── move_number
│   ├── type: Number
│   └── notes: Move in game that wager was made, in terms of half moves
├── status
│   ├── type: WagerStatus (String)
│   └── notes: Status of wager
├── resolved
│   ├── type: Boolean
│   └── notes: Whether or not wager has been resolved yet, derived from "status"
├── winning_pool_share
│   ├── type: Number
│   └── notes: For pool wagers, share of pool that winners receive
└── winnings
    ├── type: Number
    └── notes: Virtual field derived from "status", "wdl", "amount", "odds", and "winning_pool_share"
```

## Authors

- Jack Keane '22
- Faustino Cortina '21
- Benedict Tedjokusumo '23