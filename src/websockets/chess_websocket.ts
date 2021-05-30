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

const websocket = (socket: Socket<ChessListenEvents, ChessEmitEvents>): void => {
  socket.on('join_game', async (gameId: string) => {
    const chessDoc = await chessService.getChessGame(gameId);
    if (!chessDoc) return socket.emit('game_error', { gameId, message: 'Could not find game' });

    socket.join(gameId);
    return socket.emit('game_info', { gameId, data: chessDoc.toJSON() });
  });

  socket.on('leave_game', (gameId: string) => {
    socket.leave(gameId);
    return socket.emit('leave_game', { gameId, message: 'Left room' });
  });

  socket.on('join_auth', async (token: string) => {
    const payload = decodeToken(token);
    if (payload?.sub) {
      if (socket.rooms.has(payload.sub)) return true;

      socket.join(payload.sub);
      return socket.emit('join_auth', { message: 'Successfully joined' });
    }
    const unverifiedPayload = decodeToken(token, true);
    if (unverifiedPayload?.sub) socket.leave(unverifiedPayload.sub);
    return socket.emit('socket_error', { message: 'Error parsing token' });
  });

  socket.on('leave_auth', (token: string) => {
    const payload = decodeToken(token, true);
    if (payload?.sub) {
      socket.leave(payload.sub);
      return socket.emit('leave_auth', { message: 'Successfully left' });
    }
    return socket.emit('socket_error', { message: 'Error parsing token' });
  });

  socket.on('pool_wager', async (wager) => {
    const newGame = await chessService.updateChessGame(wager.gameId, { $push: { [`pool_wagers.${wager.type}.wagers`]: { data: wager.data, amount: wager.amount } } });
    if (newGame) return socket.to(wager.gameId).emit('pool_wager', wager);
    return socket.emit('socket_error', { message: 'issue updating' });
  });

  socket.on('new_move', async (move: { gameId: string, data: MoveData }): Promise<boolean> => {
    // need to add protection for who can move.
    const chessDoc = await chessService.getChessGame(move.gameId);
    if (!chessDoc) return socket.emit('game_error', { gameId: move.gameId, message: 'Could not find game' });

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

    socket.to(move.gameId).emit('new_move', { gameId: move.gameId, ...updateMessage });

    chessService.updateChessGame(move.gameId, updateMessage);

    // resolve wagers on the move just played, if any
    resolveCriticalMoveWagers(move.gameId, chessGame, chessDoc.pool_wagers.move.options).then((wagerResults) => {
      if (wagerResults) Object.entries(wagerResults).forEach(([id, wagers]) => socket.to(id).emit('wager_result', { gameId: move.gameId, wagers }));
      else socket.to(move.gameId).emit('game_error', { gameId: move.gameId, message: 'There was an error updating critical move wagers' });
    });

    const oddsPromise = microservice
      .getWDL(chessGame.fen(), timeWhite, timeBlack)
      .then((res) => res ?? { white_win: 0.0, draw: 0.0, black_win: 0.0 });
    const topMovesPromise = microservice
      .getTopMoves(chessGame.fen(), 3)
      .then((res) => res ?? []);

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

      socket.to(move.gameId).emit('new_odds', { gameId: move.gameId, ...oddsUpdate });

      // don't check if update successful

      chessService
        .updateChessGame(move.gameId, oddsUpdate)
        .then((res) => res || socket.to(move.gameId).emit('game_error', { gameId: move.gameId, message: 'There was an error saving' }));
    });

    const gameStatus = getChessStatus(chessGame);
    const complete = gameStatus !== GameStatus.IN_PROGRESS;

    // update wagers for each user
    if (complete) {
      const completeFields: UpdateQuery<ChessDoc> = {
        complete: true,
        game_status: gameStatus,
      };
      socket.to(move.gameId).emit('game_over', { gameId: move.gameId, ...completeFields });
      await chessService.updateChessGame(move.gameId, completeFields);

      resolveWdlWagers(move.gameId, gameStatus).then((wagerResults) => {
        if (wagerResults) Object.entries(wagerResults).forEach(([id, wagers]) => socket.to(id).emit('wager_result', { gameId: move.gameId, wagers }));
        else socket.to(move.gameId).emit('game_error', { gameId: move.gameId, message: 'There was an error updating critical move wagers' });
      });
    }
    return true;
  });
};

export default websocket;
