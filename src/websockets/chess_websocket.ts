/* eslint-disable no-mixed-operators */
import { Socket } from 'socket.io';
import { Chess as ChessGame } from 'chess.js';
import { Types, UpdateQuery } from 'mongoose';
import { ChessDoc } from 'types/models';
import { resolveCriticalMoveBets, resolveWdlBets } from 'helpers/resolve_bets';
import { Wager as WagerModel } from 'models';
import { chessController } from 'controllers';
import { microservice } from 'services';
import { GameStatus } from 'helpers/constants';

const websocket = (socket: Socket): void => {
  socket.emit('on_connect', 'connected to /chess');

  socket.on('join_game', async (gameId: string) => {
    const chessDoc = await chessController.getChessGame(gameId);
    if (!chessDoc) return socket.emit('error', 'Could not find game');

    socket.join(gameId);
    // console.log(`joined ${gameId}`);
    // get game state

    return socket.emit('game_info', 'game state object');
  });

  socket.on('new_move', async (move: { gameId: string, data: string }): Promise<boolean> => {
    // need to add protection for who can move.
    const chessDoc = await chessController.getChessGame(move.gameId);
    if (!chessDoc) return socket.emit('error', 'Could not find game');

    const chessGame = new ChessGame(chessDoc.state);

    const moveResult = chessGame.move(move.data);

    if (!moveResult) return socket.emit('error', 'Invalid move');

    // resolve wagers on the move just played, if any
    const moveNum = chessGame.history().length;
    const [lastMove] = chessGame.history().slice(-1);

    const moveWagers = await WagerModel.find({
      game_id: move.gameId, wdl: false, move_number: moveNum, resolved: false,
    });
    if (!moveWagers) socket.to(move.gameId).emit('error', 'There was an error updating the critical move wagers');

    resolveCriticalMoveBets(moveWagers, lastMove)
      .then(() => {
        // console.log('all critical move bets have been resolved');
      })
      .catch(() => {
        socket.to(move.gameId).emit('error', 'There was an error updating the critical move wagers');
      });

    // send board state to ML model
    // ...
    // on return send new wagers
    microservice.getWDL(chessGame.fen(), chessDoc.time_white, chessDoc.time_black).then((res) => {
      // console.log(res);
      if (res) {
        socket.to(move.gameId).emit('wagers', res);
        // save probabilities to chessDoc
      }
    });

    let gameStatus = GameStatus.IN_PROGRESS;

    if (chessGame.game_over()) {
      if (chessGame.in_checkmate()) {
        gameStatus = chessGame.turn() === 'b' ? GameStatus.WHITE_WIN : GameStatus.BLACK_WIN;
      } else {
        gameStatus = GameStatus.DRAW;
      }
    }

    const complete = gameStatus !== GameStatus.IN_PROGRESS;

    const fields: UpdateQuery<ChessDoc> = {
      state: chessGame.fen(),
      move_hist: [...chessDoc.move_hist, move.data] as Types.Array<string>,
      game_status: gameStatus,
      complete,
    };

    const result = await chessController.updateChessGame(move.gameId, fields);

    if (!result) socket.to(move.gameId).emit('error', 'There was an error saving');

    socket.to(move.gameId).emit('new_move', move.data);

    // update wagers for each user
    if (complete) {
      const wagers = await WagerModel.find({ game_id: move.gameId, wdl: true, resolved: false });
      if (!wagers) socket.to(move.gameId).emit('error', 'There was an error updating the win/draw/loss wagers');

      resolveWdlBets(wagers, gameStatus)
        .then(() => {
          // console.log('all wdl bets have been resolved');
        })
        .catch(() => {
          socket.to(move.gameId).emit('error', 'There was an error updating the win/draw/loss wagers');
        });
    }
    return true;
  });
};

export default websocket;
