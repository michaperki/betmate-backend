/* eslint-disable no-mixed-operators */
import { Socket } from 'socket.io';
import { Chess as ChessGame } from 'chess.js';
import { Types, UpdateQuery } from 'mongoose';
import {
  AnonMoveWager, ChessDoc, GameStatus, MoveData,
} from 'types/models';
import { resolveCriticalMoveWagers, resolveWdlWagers } from 'helpers/resolve_bets';
import { chessController, userController } from 'controllers';
import { microservice } from 'services';
import { getChessStatus } from 'helpers/chess_logic';

interface PoolBetMessage {
  gameId: string
  type: 'move'
  data: string
  amount: number
}

const websocket = (socket: Socket): void => {
  socket.emit('on_connect', 'connected to /chess');

  socket.on('join_game', async (gameId: string) => {
    const chessDoc = await chessController.getChessGame(gameId);
    if (!chessDoc) return socket.emit('error', { gameId, message: 'Could not find game' });

    socket.join(gameId);
    return socket.emit('game_info', { gameId, data: chessDoc.toJSON() });
  });

  socket.on('leave_game', (gameId: string) => {
    socket.leave(gameId);
    return socket.emit('leave_game', { gameId, message: 'Left room' });
  });

  socket.on('join_auth', async (token: string) => {
    const payload = userController.decodeToken(token);
    if (payload?.sub) {
      if (socket.rooms.has(payload.sub)) return true;

      socket.join(payload.sub);
      return socket.emit('join_auth', { message: 'Successfully joined' });
    }
    const unverifiedPayload = userController.decodeToken(token, true);
    if (unverifiedPayload?.sub) socket.leave(unverifiedPayload.sub);
    return socket.emit('socket_error', { message: 'Error parsing token' });
  });

  socket.on('leave_auth', (token: string) => {
    const payload = userController.decodeToken(token, true);
    if (payload?.sub) {
      socket.leave(payload.sub);
      return socket.emit('leave_auth', { message: 'Successfully left' });
    }
    return socket.emit('socket_error', { message: 'Error parsing token' });
  });

  socket.on('new_move', async (move: { gameId: string, data: MoveData }): Promise<boolean> => {
    // need to add protection for who can move.
    const chessDoc = await chessController.getChessGame(move.gameId);
    if (!chessDoc) return socket.emit('game_error', { gameId: move.gameId, message: 'Could not find game' });

    const chessGame = new ChessGame(chessDoc.state);

    const moveResult = chessGame.move(move.data.san);
    if (!moveResult) return socket.emit('game_error', { gameId: move.gameId, message: 'Invalid move' });

    const timeWhite = move.data.is_white ? move.data.time : chessDoc.time_white;
    const timeBlack = !move.data.is_white ? move.data.time : chessDoc.time_black;

    const updateMessage = {
      state: chessGame.fen(),
      move_hist: [...chessDoc.move_hist, move.data],
      time_white: timeWhite,
      time_black: timeBlack,
      pool_wagers: { move: [] },
    };

    socket.to(move.gameId).emit('new_move', { gameId: move.gameId, ...updateMessage });

    // const odds = await microservice
    //   .getWDL(chessGame.fen(), timeWhite, timeBlack)
    //   .then((res) => res ?? { white_win: 0.0, draw: 0.0, black_win: 0.0 });

    // socket.to(move.gameId).emit('new_odds', { gameId: move.gameId, odds });

    // resolve wagers on the move just played, if any
    resolveCriticalMoveWagers(move.gameId, chessGame).then((wagerResults) => {
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
        gameId: move.gameId,
        odds,
        pool_wagers: {
          move: {
            options: topMoves,
          },
        },
      };

      socket.to(move.gameId).emit('new_odds', oddsUpdate);

      // update gameDoc
      const gameUpdate: UpdateQuery<ChessDoc> = {
        ...updateMessage,
        move_hist: [...chessDoc.move_hist, move.data] as Types.Array<MoveData>,
        odds,
        pool_wagers: {
          move: {
            wagers: [] as unknown as Types.Array<AnonMoveWager>,
            options: topMoves as Types.Array<string>,
          },
        },
      };

      // don't check if update successful

      chessController
        .updateChessGame(move.gameId, gameUpdate)
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
      await chessController.updateChessGame(move.gameId, completeFields);

      resolveWdlWagers(move.gameId, gameStatus).then((wagerResults) => {
        if (wagerResults) Object.entries(wagerResults).forEach(([id, wagers]) => socket.to(id).emit('wager_result', { gameId: move.gameId, wagers }));
        else socket.to(move.gameId).emit('game_error', { gameId: move.gameId, message: 'There was an error updating critical move wagers' });
      });
    }
    return true;
  });

  socket.on('pool_wager', async (wager: PoolBetMessage) => {
    const newGame = await chessController.updateChessGame(wager.gameId, { $push: { [`pool_wagers.${wager.type}.wagers`]: { data: wager.data, amount: wager.amount } } });
    if (newGame) return socket.to(wager.gameId).emit('pool_wager', wager);
    return socket.emit('socket_error', { message: 'issue updating' });
  });
};

export default websocket;
