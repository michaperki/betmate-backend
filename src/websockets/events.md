# Events Overview

## Event Listeners

An overview of the basic event listener layout of the websocket

```text
server (/)
│
└── /chessws
    ├── 'join_game'
    │   └── gameId -> join socket room of <gameId>
    │
    ├── 'leave_game'
    │   └── gameId -> leave socket room of <gameId>
    │
    ├── 'join_auth'
    │   └── token -> join socket room of user ID from decoded token
    │
    ├── 'leave_auth'
    │   └── token -> leave socket room of user ID from decoded token
    │
    ├── 'pool_wager'
    │   └── wager -> update pool wagers of game with `wager` and broadcast `wager` to game room
    │
    └── 'new_move'
        └── move -> update game, resolve bets, and broadcast updates resulting from `move`
```

## Event Emitters

An overview of the basic event emitters of the websocket

```text
├── 'new_game'
│   ├── trigger: New game is created in database
│   └── payload: ChessDoc of new game
│
├── 'start_game'
│   ├── trigger: Game is starting
│   └── payload: Updated fields of game
│
├── 'new_move'
│   ├── trigger: Move is made in game
│   └── payload: Updated fields of game
│
├── 'game_over'
│   ├── trigger: Game is over
│   └── payload: Updated fields of game
│
├── 'game_info'
│   ├── trigger: User joins room of game
│   └── payload: ChessDoc of game and game ID
│
├── 'game_error'
│   ├── trigger: Error related to processing game
│   └── payload: gameId and message about error
│
├── 'new_odds'
│   ├── trigger: New odds and move options are returned from microservice
│   └── payload: Updated odds and move options of game
│
├── 'pool_wager'
│   ├── trigger: Pool wager successfully updated to game
│   └── payload: Anonymized wager
│
├── 'wager_result'
│   ├── trigger: Wagers get resolved
│   └── payload: Array of wagers and gameId
│
├── 'leave_game'
│   ├── trigger: Socket successfully leaves game room
│   └── payload: gameId and success message
│
├── 'join_auth'
│   ├── trigger: Socket successfully joins auth room
│   └── payload: success message
│
├── 'leave_auth'
│   ├── trigger: Socket successfully leaves auth room
│   └── payload: success message
│
└── 'socket_error'
    ├── trigger: Error with non-game related processing
    └── payload: message about error
```
