/* eslint-disable no-mixed-operators */
import { Socket } from 'socket.io';
import { Chess as ChessGame } from 'chess.js';
import { IWager } from 'types/models';
import { Users, Wager } from '../models';
import { chessController } from '../controllers';
import { GameStatus } from '../helpers/constants';

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
    // send board state to ML model
    // ...
    // on return send new wagers

    let gameStatus = GameStatus.IN_PROGRESS;

    if (chessGame.game_over()) {
      if (chessGame.in_checkmate()) {
        gameStatus = chessGame.turn() === 'b' ? GameStatus.WHITE_WIN : GameStatus.BLACK_WIN;
      } else {
        gameStatus = GameStatus.DRAW;
      }
    }

    const complete = gameStatus !== GameStatus.IN_PROGRESS;

    const fields = {
      state: chessGame.fen(),
      move_hist: [...chessDoc.move_hist, move.data],
      game_status: gameStatus,
      complete,
    };

    const result = await chessController.updateChessGame(move.gameId, fields);

    if (!result) socket.to(move.gameId).emit('error', 'There was an error saving');

    socket.to(move.gameId).emit('new_move', move.data);

    // update wagers for each user
    if (complete) {
      const wagers = await Wager.find({ game_id: move.gameId, wdl: true, resolved: false });
      if (!wagers) socket.to(move.gameId).emit('error', 'There was an error updating the wagers');

      const wagerUpdatePromises: Promise<IWager | null>[] = wagers.map((wager) => {
        const { odds } = wager;
        const wonBet = wager.data === gameStatus;
        let winnings = 0;
        // using decimal notation for odds
        if (wonBet) winnings = odds * wager.amount;

        return (
          Users
            .findByIdAndUpdate(wager.bettor_id, { $inc: { account: winnings } })
            .then(() => Wager.findByIdAndUpdate(wager.id, { resolved: true }))
        );
      });
      Promise
        .all(wagerUpdatePromises)
        .then(() => {
          // console.log('all bets have been resolved');
        })
        .catch((error) => {
          socket.to(move.gameId).emit('error', 'There was an error updating the wagers');
        });
    }
    return true;
  });
};

export default websocket;
