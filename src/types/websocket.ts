import { UpdateQuery } from 'mongoose';
import { ChessDoc, MoveData, WagerDoc } from './models';

interface PoolBetMessage {
  gameId: string
  type: 'move'
  data: string
  amount: number
}

interface MoveMessage {
  gameId: string
  data: MoveData
}

interface GameUpdateMessage extends UpdateQuery<ChessDoc> {
  gameId: string
}

type Emitter<T> = (message: T) => void;

export interface ChessListenEvents {
  'join_game': (gameId: string) => Promise<boolean>
  'leave_game': (gameId: string) => boolean
  'join_auth': (token: string) => Promise<boolean>
  'leave_auth': (gameId: string) => boolean
  'pool_wager': (wager: PoolBetMessage) => Promise<boolean>
  'new_move': (move: MoveMessage) => Promise<boolean>
}

export interface ChessEmitEvents {
  'new_game': Emitter<ChessDoc>
  'start_game': Emitter<GameUpdateMessage>
  'new_move': Emitter<GameUpdateMessage>
  'game_over': Emitter<GameUpdateMessage>
  'game_info': Emitter<{ gameId: string, data: ChessDoc }>,
  'game_error': Emitter<{ gameId: string, message: string }>
  'new_odds': Emitter<GameUpdateMessage>
  'pool_wager': Emitter<PoolBetMessage>
  'wager_result': Emitter<{ gameId: string, wagers: WagerDoc[] }>
  'leave_game': Emitter<{ gameId: string, message: string }>,
  'join_auth': Emitter<{ message: string }>,
  'leave_auth': Emitter<{ message: string }>
  'socket_error': Emitter<{ message: string }>
}
