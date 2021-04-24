import { GameStatus } from 'helpers/constants';
import { Player } from './models';

export interface MoveData {
  san: string,
  time: number,
  is_white: boolean
}

export interface ReplaySchema {
  white: Player,
  black: Player,
  moves: MoveData[],
  outcome: Exclude<GameStatus, GameStatus.NOT_STARTED | GameStatus.IN_PROGRESS>,
}
