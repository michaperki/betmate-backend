export interface Player {
  user: {
    name: string
    id: string
    patron?: boolean
    title?: string
  }
  rating: number
  provisional?: boolean
  ratingDiff?: number
}

export interface LichessGame {
  id: string
  rated: boolean
  variant: string
  speed: string
  perf: string
  createdAt: number
  lastMoveAt: number
  status: string
  players: {
    white: Player
    black: Player
  }
  winner?: string
  moves: string
  pgn: string
  clock: {
    initial: number
    increment: number
    totalTime: number
  }
  tournament?: string
  swiss?: string
  drawOffers?: string[]
}

export interface Variant {
  key: string
  name: string
  short: string
}

export interface Status {
  id: number
  name: string
}

export interface LichessStreamStart {
  id: string
  variant: Variant
  speed: string
  perf: string
  rated: boolean
  initialFen: string
  fen: string
  player: string
  turns: number
  startedAtTurn: number
  source: string
  status: Status
  createdAt: number
  lastMove?: string
  threefold?: boolean
  check?: string
  winner?: string
  drawOffers?: number[]
  tournamentId?: string
  swissId?: string
}

export interface LichessStreamEnd extends LichessStreamStart {
  winner: string
  tournamentId?: string
  check?: string
}

export interface LichessStreamMove {
  fen: string
  lm?: string
  wc: number
  bc: number
}

export type StreamData = LichessStreamStart | LichessStreamMove | LichessStreamEnd;

export interface LichessStreamer {
  name: string
  id: string
  title?: string
  patron?: boolean
}
