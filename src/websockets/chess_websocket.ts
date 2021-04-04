import { Socket } from 'socket.io';

const websocket = (socket: Socket) => {
    socket.emit('on_connect', 'connected to /chess');

    socket.on('join_game', (game: string) => {
        socket.join(game);

        // get game state

        return socket.emit('game_info', 'game state object');
    })

    socket.on('new_move', (move) => {
        socket.to(move.game).emit('new_move', { ...move, wagers: null });

        // update board state
        // send board state to model
        // ...
        // on return send new wagers

        // check wagers
        // update wagers for each user
    })
}

export default websocket;