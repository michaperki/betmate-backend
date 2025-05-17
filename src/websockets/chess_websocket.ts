/* eslint-disable no-mixed-operators */
import { Socket } from 'socket.io';
import Filter from 'bad-words';
import { chessService } from '../services';
import { ChessEmitEvents, ChessListenEvents } from '../types/websocket';
import { decodeToken } from '../helpers/utils';
import {
  GameChatSchema,
  JoinAuthSchema, JoinGameSchema, LeaveAuthSchema, LeaveGameSchema, PoolWagerSchema,
} from '../validation/websocket';
import { validate } from '../validation';
import { ChessDoc } from '../types/models/chess';

const filter = new Filter();

/**
 * Websocket event handler
 * @param socket in `/chessws` namespace
 */
const websocket = (socket: Socket<ChessListenEvents, ChessEmitEvents>): void => {
  /**
   * Handler for `join_game` event
   *
   * Check if chess game with ID `gameId` exists
   * If so, then put socket in room of `gameId`
   * Otherwise, provide error message to client
   */
  socket.on('join_game', async (gameId: string) => {
    try {
      validate(JoinGameSchema)(gameId);
      const chessDoc = await chessService.getChessGame(gameId);
      socket.join(gameId);
      const gameData = chessDoc.toJSON();
      return socket.emit('game_info', { gameId, data: gameData as unknown as ChessDoc });
    } catch (error) {
      return socket.emit('game_error', { gameId, message: error.message });
    }
  });

  /**
   * Handler for `leave_game` event
   *
   * Remove socket from room of `gameId`
   * Provide success message to user
   */
  socket.on('leave_game', (gameId: string) => {
    try {
      validate(LeaveGameSchema)(gameId);
      socket.leave(gameId);
      return socket.emit('leave_game', { gameId, message: 'Left room' });
    } catch (error) {
      return socket.emit('game_error', { gameId, message: error.message });
    }
  });

  /**
   * Handler for `join_auth` event
   *
   * Decodes and verifies `token` to get user ID
   * If successful, put socket in room of <userID> and provide success message
   * If unsucessful, remove socket from room of <userID> and provide error message
   */
  socket.on('join_auth', async (token: string) => {
    try {
      validate(JoinAuthSchema)(token);
      const payload = decodeToken(token);
      if (payload?.sub) {
        if (socket.rooms.has(payload.sub)) return true;

        socket.join(payload.sub);
        return socket.emit('join_auth', { message: 'Successfully joined' });
      }
      return socket.emit('socket_error', { message: 'Error parsing token' });
    } catch (error) {
      return socket.emit('socket_error', { message: error.message });
    }
  });

  /**
   * Handler for `leave_auth` event
   *
   * Decodes and verifies `token` to get user ID
   * If successful, remove socket from room of <userID> and provide success message
   * If unsucessful, provide error message
   */
  socket.on('leave_auth', (token: string) => {
    try {
      validate(LeaveAuthSchema)(token);
      const payload = decodeToken(token, true);
      if (payload?.sub) {
        socket.leave(payload.sub);
        return socket.emit('leave_auth', { message: 'Successfully left' });
      }
      return socket.emit('socket_error', { message: 'Error parsing token' });
    } catch (error) {
      return socket.emit('socket_error', { message: error.message });
    }
  });

  /**
   * Handler for `pool_wager` event
   *
   * Update game <wager.gameId> pool_wager state with new wager.
   * If update successful, broadcast to room of <wager.gameId>
   * If update unsuccessful, provide error message to client
   */
  socket.on('pool_wager', async (wager) => {
    try {
      validate(PoolWagerSchema)(wager);
      await chessService.updateChessGame(wager.gameId, { $push: { [`pool_wagers.${wager.type}.wagers`]: { data: wager.data, amount: wager.amount } } });
      return socket.to(wager.gameId).emit('pool_wager', wager);
    } catch (error) {
      return socket.emit('socket_error', { message: error.message });
    }
  });

  socket.on('game_chat', (msg) => {
    try {
      validate(GameChatSchema)(msg);
      const rej = filter.isProfane(msg.chat);
      if (rej) return socket.emit('chat_swear', { message: 'You cannot use profanity' });
      return socket.to(msg.gameId).emit('game_chat', msg);
    } catch (error) {
      return socket.emit('socket_error', { message: error.message });
    }
  });
};

export default websocket;
