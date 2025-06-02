/* eslint-disable no-mixed-operators */
import { Socket } from 'socket.io';
import Filter from 'bad-words';
import { chessService, agentService } from '../services';
import { ChessEmitEvents, ChessListenEvents } from '../types/websocket';
import { ChessDoc } from '../types/models/chess';
import { decodeToken } from '../helpers/utils';
import {
  GameChatSchema,
  JoinAuthSchema, JoinGameSchema, LeaveAuthSchema, LeaveGameSchema, PoolWagerSchema,
} from '../validation/websocket';
import { validate } from '../validation';

const filter = new Filter();

// Track viewer counts per game room
const gameViewerCounts: { [gameId: string]: number } = {};

/**
 * Websocket event handler with improved connection reliability
 * @param socket in `/chessws` namespace
 */
const websocket = (socket: Socket<ChessListenEvents, ChessEmitEvents>): void => {
  // Log new connections with details for debugging
  const clientInfo = {
    id: socket.id,
    origin: socket.handshake.headers.origin,
    referer: socket.handshake.headers.referer,
    address: socket.handshake.address
  };

  console.log(`New websocket connection: ${socket.id}`, { clientInfo });

  // Set up heartbeat to detect silent disconnections
  let heartbeatInterval: NodeJS.Timeout;
  let missedHeartbeats = 0;
  const MAX_MISSED_HEARTBEATS = 3;

  // Start heartbeat monitoring
  const startHeartbeat = () => {
    clearInterval(heartbeatInterval); // Clear any existing interval

    heartbeatInterval = setInterval(() => {
      if (missedHeartbeats >= MAX_MISSED_HEARTBEATS) {
        // Too many missed heartbeats, consider connection dead
        console.log(`Client ${socket.id} missed ${MAX_MISSED_HEARTBEATS} heartbeats - closing connection`);
        socket.disconnect(true);
        clearInterval(heartbeatInterval);
        return;
      }

      missedHeartbeats++;
      socket.emit('heartbeat_ping');
    }, 30000); // 30 second interval
  };

  // Handle heartbeat responses
  socket.on('heartbeat', () => {
    missedHeartbeats = 0; // Reset counter when client responds
  });

  // Initialize heartbeat on connection
  startHeartbeat();

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

      // Update viewer count
      gameViewerCounts[gameId] = (gameViewerCounts[gameId] || 0) + 1;

      // Broadcast updated viewer count to all clients in the room (including this one)
      socket.emit('viewer_count_update', {
        gameId,
        viewerCount: gameViewerCounts[gameId]
      });
      socket.to(gameId).emit('viewer_count_update', {
        gameId,
        viewerCount: gameViewerCounts[gameId]
      });

      return socket.emit('game_info', { gameId, data: chessDoc as ChessDoc });
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

      // Update viewer count
      if (gameViewerCounts[gameId] > 0) {
        gameViewerCounts[gameId] -= 1;

        // Broadcast updated viewer count to remaining clients in the room
        socket.to(gameId).emit('viewer_count_update', {
          gameId,
          viewerCount: gameViewerCounts[gameId]
        });
      }

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

      // Notify agent service that a wager was placed on this game and move
      if (wager.type === 'move') {
        // Get the current game to determine move number
        const game = await chessService.getChessGame(wager.gameId);
        if (game) {
          // Update agent service with information that a move has wagers
          agentService.handleNewMoveEvent(wager.gameId, true);
        }
      }

      // Broadcast the wager to all clients in the game room
      socket.to(wager.gameId).emit('pool_wager', wager);

      // Also emit a general bet update event for real-time stats updates (to all clients including current)
      socket.emit('bet_update', {
        gameId: wager.gameId,
        type: wager.type,
        data: wager.data,
        amount: wager.amount
      });
      socket.to(wager.gameId).emit('bet_update', {
        gameId: wager.gameId,
        type: wager.type,
        data: wager.data,
        amount: wager.amount
      });

      return;
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

  // Handle socket disconnection to clean up resources and update viewer counts
  socket.on('disconnect', (reason) => {
    // Clear the heartbeat interval
    if (heartbeatInterval) {
      clearInterval(heartbeatInterval);
    }

    // Enhanced logging for disconnections with additional context
    const clientInfo = {
      id: socket.id,
      origin: socket.handshake.headers.origin,
      referer: socket.handshake.headers.referer,
      address: socket.handshake.address
    };

    console.log(`Client ${socket.id} disconnected: ${reason}`, { clientInfo });

    // In production, log additional connection details for debugging
    if (process.env.NODE_ENV === 'production') {
      try {
        const connDetails = {
          transport: socket.conn.transport.name,
          remoteAddress: socket.conn.remoteAddress,
          rooms: Array.from(socket.rooms),
          reason
        };
        console.log(`[PROD] Socket connection details:`, connDetails);
      } catch (err) {
        console.error("Error logging socket details:", err);
      }
    }

    // Clean up viewer counts for all rooms this socket was in
    socket.rooms.forEach((room) => {
      if (gameViewerCounts[room] && gameViewerCounts[room] > 0) {
        gameViewerCounts[room] -= 1;
        socket.to(room).emit('viewer_count_update', {
          gameId: room,
          viewerCount: gameViewerCounts[room]
        });
      }
    });
  });
};

// Export function to get current viewer count for API calls
export const getViewerCount = (gameId: string): number => {
  return gameViewerCounts[gameId] || 0;
};

export default websocket;
