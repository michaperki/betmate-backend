/* eslint-disable no-mixed-operators */
import { Socket } from 'socket.io';
import { Chess as ChessGame } from 'chess.js';
import { Types, UpdateQuery } from 'mongoose';
import { resolveCriticalMoveWagers, resolveWdlWagers } from 'helpers/resolve_bets';
import { chessService, microservice } from 'services';
import { getChessStatus } from 'helpers/chess_logic';
import { ChessEmitEvents, ChessListenEvents } from 'types/websocket';
import { decodeToken } from 'helpers/utils';
import {
  AnonMoveWager, ChessDoc, GameStatus, MoveData,
} from 'types/models/chess';
import {
  JoinAuthSchema, JoinGameSchema, LeaveAuthSchema, LeaveGameSchema, PoolWagerSchema,
} from 'validation/websocket';
import { validate } from 'validation';

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
      return socket.emit('game_info', { gameId, data: chessDoc.toJSON() });
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

  /**
   * Handler for `new_move` event
   *
   * Procedure
   *   - Retreive game <move.gameId> from database
   *   - Update game with respect to `move.data`
   *   - Broadcast update
   *   - Resolve move wagers, broadcast results to each user
   *   - Get new odds and move options from microservice. With resulting data, update game and broadcast
   *   - Check if game is complete
   *   - If so, resolve win/draw/loss wagers, broadcast results to each user
   */
  socket.on('new_move', async (move: { gameId: string, data: MoveData }): Promise<boolean> => {
    // need to add protection for who can move.
    try {
      const chessDoc = await chessService.getChessGame(move.gameId);

      // Update game with move data
      const chessGame = new ChessGame(chessDoc.state);

      const moveResult = chessGame.move(move.data.san);
      if (!moveResult) return socket.emit('game_error', { gameId: move.gameId, message: 'Invalid move' });

      const timeWhite = move.data.is_white ? move.data.time : chessDoc.time_white;
      const timeBlack = !move.data.is_white ? move.data.time : chessDoc.time_black;

      const updateMessage = {
        state: chessGame.fen(),
        move_hist: [...chessDoc.move_hist, move.data] as Types.Array<MoveData>,
        time_white: timeWhite,
        time_black: timeBlack,
        pool_wagers: {
          move: {
            wagers: [] as unknown as Types.Array<AnonMoveWager>,
            options: [] as unknown as Types.Array<string>,
          },
        },
      };

      // Broadcast updated game and save to database
      socket.to(move.gameId).emit('new_move', { gameId: move.gameId, ...updateMessage });
      chessService.updateChessGame(move.gameId, updateMessage);

      // resolve wagers on the move just played, broadcast results to users
      resolveCriticalMoveWagers(move.gameId, chessGame, chessDoc.pool_wagers.move.options)
        .then((wagerResults) => (
          Object
            .entries(wagerResults)
            .forEach(([id, wagers]) => socket.to(id).emit('wager_result', { gameId: move.gameId, wagers }))
        ));

      // get new odds from microservice
      const oddsPromise = microservice
        .getWDL(chessGame.fen(), Math.floor((timeWhite / 300) * 180), Math.floor((timeBlack / 300) * 180))
        .catch(() => ({ white_win: 0.0, draw: 0.0, black_win: 0.0 }));
      const topMovesPromise = microservice
        .getTopMoves(chessGame.fen(), 3)
        .catch(() => []);

      Promise.all([oddsPromise, topMovesPromise]).then(([odds, topMoves]) => {
        const oddsUpdate = {
          odds,
          pool_wagers: {
            move: {
              wagers: [] as unknown as Types.Array<AnonMoveWager>,
              options: topMoves as Types.Array<string>,
            },
          },
        };

        // broadcast new odds and save to database
        socket.to(move.gameId).emit('new_odds', { gameId: move.gameId, ...oddsUpdate });
        chessService.updateChessGame(move.gameId, oddsUpdate);
      });

      // Check if game is complete
      const gameStatus = getChessStatus(chessGame);
      const complete = gameStatus !== GameStatus.IN_PROGRESS;

      // resolve win/draw/loss wagers, broadcast results to users
      if (complete) {
        const completeFields: UpdateQuery<ChessDoc> = {
          complete: true,
          game_status: gameStatus,
        };
        socket.to(move.gameId).emit('game_over', { gameId: move.gameId, ...completeFields });
        await chessService.updateChessGame(move.gameId, completeFields);

        resolveWdlWagers(move.gameId, gameStatus)
          .then((wagerResults) => (
            Object
              .entries(wagerResults)
              .forEach(([id, wagers]) => socket.to(id).emit('wager_result', { gameId: move.gameId, wagers }))
          ));
      }
    } catch (error) {
      socket.emit('game_error', { gameId: move.gameId, message: error.message });
      return false;
    }
    // Retreive game from database
    return true;
  });
};

export default websocket;
