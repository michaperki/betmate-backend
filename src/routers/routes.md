# Routes Overview

An overview of the basic route layout of this server

```text
server (/)
│
├── /auth
│   ├── /signup
│   │   └── POST -> create user and JWT token
│   │
│   ├── /signin
│   │   └── POST -> get user and create JWT token
│   │
│   └── /jwt-signin
│       └── GET -> get user
│    
├── /chess
│   ├── /
│   │   ├── GET -> get many chess games
│   │   └── POST -> create chess game
│   │
│   └── /:id
│       ├── GET -> get specific chess game
│       └── PUT -> update specific chess game
│
├── /users
│   ├── /
│   │   ├── GET -> get user
│   │   ├── PUT -> update user
│   │   └── DELETE -> remove user
│   │
│   └── /all
│       └── GET -> get all users
│
└── /wager
    ├── /
    │   └── GET -> get all wagers of user
    │
    └── /:id
        ├── GET -> get specific wager
        └── POST -> create wager

```

## Authentication Flow

user goes to site (first time) -> input credentials -> send to server -> server authenticates -> server sends token -> token placed on frontend -> user proceeeds to site

user goes to site (next times) -> token sent to server -> server authenticates user from token -> server returns validation -> user proceeds to site
