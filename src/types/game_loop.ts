import { GameStatus, MoveData, Player } from './models';

export interface ReplaySchema {
  white: Player,
  black: Player,
  moves: MoveData[],
  outcome: Exclude<GameStatus, GameStatus.NOT_STARTED | GameStatus.IN_PROGRESS>,
}

export interface GameData {
  game: ReplaySchema,
  gameTimeLength: number
}
