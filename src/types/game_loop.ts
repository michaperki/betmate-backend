import { GameStatus, MoveData, Player } from './models/chess';

/* -------- Main Types -------- */

export interface ReplaySchema {
  white: Player,
  black: Player,
  moves: Exclude<MoveData, 'to' | 'from'>[],
  outcome: Exclude<GameStatus, GameStatus.NOT_STARTED | GameStatus.IN_PROGRESS>,
}

export interface GameData {
  game: ReplaySchema,
  gameTimeLength: number
}
