# Model Schemas

## Chess

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

## User


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

## Wager

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

