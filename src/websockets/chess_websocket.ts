/* eslint-disable no-mixed-operators */
import { Socket } from 'socket.io';
import { Chess as ChessGame } from 'chess.js';
import { Types, UpdateQuery } from 'mongoose';
import { ChessDoc, GameStatus } from 'types/models';
import { resolveCriticalMoveBets, resolveWdlBets } from 'helpers/resolve_bets';
import { chessController } from 'controllers';
import { microservice } from 'services';
import { getChessStatus } from 'helpers/chess_logic';
import { MoveData } from 'types/game_loop';

const websocket = (socket: Socket): void => {
  socket.emit('on_connect', 'connected to /chess');

  socket.on('join_game', async (gameId: string) => {
    const chessDoc = await chessController.getChessGame(gameId);
    if (!chessDoc) return socket.emit('error', { gameId, message: 'Could not find game' });

    socket.join(gameId);
    // console.log(`joined ${gameId}`);
    // get game state

    return socket.emit('game_info', { gameId, data: chessDoc.toJSON() });
  });

  socket.on('new_move', async (move: { gameId: string, data: MoveData }): Promise<boolean> => {
    // need to add protection for who can move.
    const chessDoc = await chessController.getChessGame(move.gameId);
    if (!chessDoc) return socket.emit('error', { gameId: move.gameId, message: 'Could not find game' });

    const chessGame = new ChessGame(chessDoc.state);

    const moveResult = chessGame.move(move.data.san);
    if (!moveResult) return socket.emit('error', { gameId: move.gameId, message: 'Invalid move' });

    socket.to(move.gameId).emit('new_move', { gameId: move.gameId, data: move.data });

    const timeWhite = move.data.is_white ? move.data.time : chessDoc.time_white;
    const timeBlack = !move.data.is_white ? move.data.time : chessDoc.time_black;

    microservice
      .getWDL(chessGame.fen(), timeWhite, timeBlack)
      .then((res) => socket.to(move.gameId).emit('wagers', { gameId: move.gameId, data: res ?? {} }));

    // resolve wagers on the move just played, if any
    resolveCriticalMoveBets(move.gameId, chessGame).then((wagerResults) => {
      if (wagerResults) socket.to(move.gameId).emit('wager_result', { gameId: move.gameId, data: wagerResults.map((w) => w.toJSON()) });
      else socket.to(move.gameId).emit('error', { gameId: move.gameId, message: 'There was an error updating critical move wagers' });
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
    };

    const result = await chessController.updateChessGame(move.gameId, fields);
    if (!result) socket.to(move.gameId).emit('error', { gameId: move.gameId, message: 'There was an error saving' });

    // update wagers for each user
    if (complete) {
      resolveWdlBets(move.gameId, gameStatus).then((wagerResults) => {
        if (wagerResults) socket.to(move.gameId).emit('wager_result', { gameId: move.gameId, data: wagerResults.map((w) => w.toJSON()) });
        else socket.to(move.gameId).emit('error', { gameId: move.gameId, message: 'There was an error updating critical move wagers' });
      });
    }
    return true;
  });
};

export default websocket;
