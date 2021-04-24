import { Namespace } from 'socket.io';
import { DefaultEventsMap } from 'socket.io/dist/typed-events';
import { ChessDoc, Player } from 'types/models';
import { chessController } from 'controllers';
import { CreateQuery, UpdateQuery, Types } from 'mongoose';
import { GameStatus } from 'helpers/constants';
import { Chess } from 'chess.js';
import WagerModel from 'models/wager_model';
import { resolveWdlBets } from 'helpers/resolve_bets';

interface MoveData {
  san: string,
  time: number,
  is_white: boolean
}

interface ReplaySchema {
  white: Player,
  black: Player,
  moves: MoveData[],
  outcome: Exclude<GameStatus, GameStatus.NOT_STARTED | GameStatus.IN_PROGRESS>,
}
// eslint-disable-next-line @typescript-eslint/no-var-requires
const data300: ReplaySchema[] = require('assets/game_data_300.json');

const PREGAME_TIME = 10;// 120;

const delay = (ms: number) => new Promise((res) => setTimeout(res, ms));

export const run300Loop = async (socket: Namespace<DefaultEventsMap>): Promise<void> => {
  // select random game
  const gameSelection = Math.floor(Math.random() * data300.length);
  const game: ReplaySchema = data300[gameSelection];

  // calculate time length of game
  const [lastWhiteMove, lastBlackMove] = game.moves.slice(-2);
  const gameTimeLength = 600 - lastWhiteMove.time - lastBlackMove.time;
  console.log('game length', gameTimeLength);

  // start new game two minutes before this one finishes
  // This may seem that it causes recursion, but it does not https://stackoverflow.com/questions/13506852/infinite-timer-loop-with-javascript-no-setinterval/13506904#13506904
  setTimeout(() => run300Loop(socket), (gameTimeLength - PREGAME_TIME) * 1000);

  const gameFields = {
    player_white: game.white,
    player_black: game.black,
  };
  // create game and put into pregame
  const newGame = await chessController.createChessGame(gameFields as CreateQuery<ChessDoc>);
  if (!newGame) { setTimeout(() => run300Loop(socket), 1000); return; }
  socket.emit('new_game', newGame.toJSON());

  console.log('id', newGame._id);

  // Pregame phase
  console.log('taking in bets');
  await delay(PREGAME_TIME * 1000);

  // Start game
  console.log('starting new game', newGame.toJSON());
  const updatedGame = await chessController.updateChessGame(newGame._id, { game_status: GameStatus.IN_PROGRESS });
  if (!updatedGame) { setTimeout(() => run300Loop(socket), 1000); return; }

  // Play game
  let [whiteTime, blackTime] = [300, 300];
  const chessGame = new Chess();
  console.log(chessGame.ascii());
  game.moves.forEach(async (move, i) => {
    // calculate delay required to broadcast move
    if (move.is_white) {
      whiteTime = move.time;
    } else {
      blackTime = move.time;
    }
    const waitTime = 600 - blackTime - whiteTime; // + i * interval

    await delay(waitTime * 1000 + i * 5);
    chessGame.move(move.san);
    console.log(chessGame.ascii());
    console.log(String(newGame._id));
    socket.to(String(newGame._id)).emit('new_move', chessGame.ascii());
    // socket.to(newGame._id).emit('new_move', { ...move, id: newGame._id });

    const gameUpdate: UpdateQuery<ChessDoc> = {
      state: chessGame.fen(),
      move_hist: chessGame.history() as Types.Array<string>,
      time_white: whiteTime,
      time_black: blackTime,
    };

    chessController.updateChessGame(updatedGame._id, gameUpdate);
  });

  // still need to wait for game to finish as forloop runs instantly
  await delay((600 - blackTime - whiteTime + 1) * 1000);

  const completeFields: UpdateQuery<ChessDoc> = {
    game_status: game.outcome,
    complete: true,
  };

  await chessController.updateChessGame(newGame._id, completeFields);

  const wagers = await WagerModel.find({ game_id: newGame._id, wdl: true, resolved: false });
  if (!wagers) socket.to(newGame._id).emit('error', 'There was an error updating the win/draw/loss wagers');

  resolveWdlBets(wagers, game.outcome)
    .then(() => {
      // console.log('all wdl bets have been resolved');
    })
    .catch(() => {
      socket.to(newGame._id).emit('error', 'There was an error updating the win/draw/loss wagers');
    });
};
