import { UpdateQuery } from 'mongoose';
import { ChessDoc, GameStatus } from './models/chess';
import { WagerDoc } from './models/wager';

/* -------- Helper Types -------- */
export interface PoolBetMessage {
  gameId: string
  type: 'move'
  data: string
  amount: number
  isBot?: boolean
  userId?: string
}

interface GameUpdateMessage extends UpdateQuery<ChessDoc> {
  gameId: string
  game_status?: GameStatus // Add direct game_status property for compatibility
}

export interface GameChatMessage {
  gameId: string
  userId: string
  userName: string
  chat: string
  time: string
}

type Emitter<T> = (message: T) => void;

/* -------- Main Types -------- */

export interface ChessListenEvents {
  'join_game': (gameId: string) => Promise<boolean>
  'leave_game': (gameId: string) => boolean
  'join_auth': (token: string) => Promise<boolean>
  'leave_auth': (gameId: string) => boolean
  'pool_wager': (wager: PoolBetMessage) => Promise<boolean>
  'game_chat': (message: GameChatMessage) => boolean
  'heartbeat': () => void
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
  'game_chat': Emitter<GameChatMessage>
  'chat_swear': Emitter<{ message: string }>
  'wager_result': Emitter<{ gameId: string, wagers: WagerDoc[] }>
  'leave_game': Emitter<{ gameId: string, message: string }>,
  'join_auth': Emitter<{ message: string }>,
  'leave_auth': Emitter<{ message: string }>
  'socket_error': Emitter<{ message: string }>
  'viewer_count_update': Emitter<{ gameId: string, viewerCount: number }>
  'bet_update': Emitter<{ gameId: string, type: string, data: string, amount: number }>
  'heartbeat_ping': Emitter<void>
}
