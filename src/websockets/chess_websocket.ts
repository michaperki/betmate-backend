/* eslint-disable no-mixed-operators */
import { Socket } from 'socket.io';
import { Chess as ChessGame } from 'chess.js';
import { Types, UpdateQuery } from 'mongoose';
import { ChessDoc, GameStatus, UserDoc } from 'types/models';
import { resolveCriticalMoveWagers, resolveWdlWagers } from 'helpers/resolve_bets';
import { chessController } from 'controllers';
import { microservice } from 'services';
import { getChessStatus } from 'helpers/chess_logic';
import { MoveData } from 'types/game_loop';
import { Users } from 'models';
import { parseToken } from 'authentication/jwt';

type AuthSocket = Socket & {
  request: {
    user: UserDoc
  }
};

const websocket = (socket: AuthSocket): void => {
  socket.emit('on_connect', 'connected to /chess');
  console.log(socket.request.user);

  socket.on('join_game', async (gameId: string) => {
    const chessDoc = await chessController.getChessGame(gameId);
    console.log('joining', gameId);
    if (!chessDoc) return socket.emit('error', { gameId, message: 'Could not find game' });

    socket.join(gameId);

    return socket.emit('game_info', { gameId, data: chessDoc.toJSON() });
  });

  socket.on('leave_game', (gameId: string) => {
    socket.leave(gameId);
    return socket.emit('leave_game', { gameId, message: 'Left room' });
  });

  socket.on('join_auth', async (token: string) => {
    try {
      const parsed = parseToken(token);
      const user = parsed?.sub && await Users.findById(parsed.sub).then((doc) => doc);
      if (user) {
        console.log('joined', parsed.sub);
        socket.join(parsed.sub);
        return socket.emit('join_auth', { message: 'Successfully joined' });
      }
      return socket.emit('socket_error', { message: 'Error parsing token' });
    } catch (error) {
      return socket.emit('socket_error', { message: 'Error parsing token' });
    }
  });

  socket.on('leave_auth', (token: string) => {
    try {
      const parsed = parseToken(token);
      if (parsed?.sub) {
        console.log('leave', parsed.sub);
        socket.leave(parsed.sub);
        return socket.emit('leave_auth', { message: 'Successfully left' });
      }
      return socket.emit('socket_error', { message: 'Error parsing token' });
    } catch (error) {
      return socket.emit('socket_error', { message: 'Error parsing token' });
    }
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
      move_hist: chessGame.history(),
      time_white: timeWhite,
      time_black: timeBlack,
    };

    socket.to(move.gameId).emit('new_move', { gameId: move.gameId, ...updateMessage });

    const odds = await microservice
      .getWDL(chessGame.fen(), timeWhite, timeBlack)
      .then((res) => res ?? { white_win: 0.0, draw: 0.0, black_win: 0.0 });

    socket.to(move.gameId).emit('new_odds', { gameId: move.gameId, odds });

    // resolve wagers on the move just played, if any
    resolveCriticalMoveWagers(move.gameId, chessGame).then((wagerResults) => {
      if (wagerResults) Object.entries(wagerResults).forEach(([id, wagers]) => socket.to(id).emit('wager_result', { gameId: move.gameId, wagers }));
      else socket.to(move.gameId).emit('game_error', { gameId: move.gameId, message: 'There was an error updating critical move wagers' });
    });

    const gameStatus = getChessStatus(chessGame);

    const complete = gameStatus !== GameStatus.IN_PROGRESS;

    const fields: UpdateQuery<ChessDoc> = {
      state: chessGame.fen(),
      move_hist: chessGame.history() as Types.Array<string>,
      game_status: gameStatus,
      complete,
      time_white: timeWhite,
      time_black: timeBlack,
      odds,
    };

    const result = await chessController.updateChessGame(move.gameId, fields);
    if (!result) socket.to(move.gameId).emit('game_error', { gameId: move.gameId, message: 'There was an error saving' });

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
};

export default websocket;
