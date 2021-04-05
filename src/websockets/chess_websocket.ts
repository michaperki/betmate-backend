import { Socket } from 'socket.io';
import { Chess as ChessGame } from 'chess.js';
import { chessController } from '../controllers';

const websocket = (socket: Socket) => {
    socket.emit('on_connect', 'connected to /chess');

    socket.on('join_game', async (gameId: string) => {
        const chessDoc = await chessController.getChessGame(gameId);
        if (!chessDoc) return socket.emit('error', 'Could not find game');

        socket.join(gameId);
        console.log(`joined ${gameId}`)
        // get game state

        return socket.emit('game_info', 'game state object');
    })

    socket.on('new_move', async (move: { gameId: string, data: string }) => {
        // need to add protection for who can move.
        const chessDoc = await chessController.getChessGame(move.gameId);
        if (!chessDoc) return socket.emit('error', 'Could not find game');
        
        const chessGame = new ChessGame(chessDoc.state);

        const moveResult = chessGame.move(move.data);

        if (!moveResult) return socket.emit('error', 'Invalid move');
        // send board state to ML model
        // ...
        // on return send new wagers

        const fields = {
            state: chessGame.fen(),
            move_hist: [...chessDoc.move_hist, move.data]
        }

        const result = await chessController.updateChessGame(move.gameId, fields);

        if (!result) socket.to(move.gameId).emit('error', 'There was an error saving');

        socket.to(move.gameId).emit('new_move', move.data);
        console.log(chessGame.ascii());
        console.log([...chessDoc.move_hist, move.data]);
        
        // check wagers
        // update wagers for each user
    })
}

export default websocket;