import { Namespace } from 'socket.io';
import { DefaultEventsMap } from 'socket.io/dist/typed-events';
import { ChessDoc } from 'types/models';
import { chessController } from 'controllers';
import { CreateQuery, UpdateQuery, Types } from 'mongoose';
import { GameStatus } from 'helpers/constants';
import { Chess } from 'chess.js';
import WagerModel from 'models/wager_model';
import { resolveWdlBets } from 'helpers/resolve_bets';
import { ReplaySchema } from 'types/game_loop';
import { microservice } from 'services';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const data300: ReplaySchema[] = require('assets/game_data_300.json');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const data900: ReplaySchema[] = require('assets/game_data_900.json');

const PREGAME_TIME = 10;// 120;

const delay = (ms: number) => new Promise((res) => setTimeout(res, ms));

const runLoop = (gameTime: number, interval: number, data: ReplaySchema[]) => async (socket: Namespace<DefaultEventsMap>): Promise<void> => {
  // select random game
  const gameSelection = Math.floor(Math.random() * data.length);
  const game: ReplaySchema = data[gameSelection];

  // calculate time length of game
  const [lastWhiteMove, lastBlackMove] = game.moves.slice(-2);
  const gameTimeLength = 2 * gameTime - lastWhiteMove.time - lastBlackMove.time + (game.moves.length * interval);
  console.log('game length', gameTimeLength);

  // start new game two minutes before this one finishes
  // This may seem that it causes recursion, but it does not https://stackoverflow.com/questions/13506852/infinite-timer-loop-with-javascript-no-setinterval/13506904#13506904
  setTimeout(() => runLoop(gameTime, interval, data)(socket), (gameTimeLength - (PREGAME_TIME / 2)) * 1000);

  const gameFields = {
    player_white: game.white,
    player_black: game.black,
  };
  // create game and put into pregame
  const newGame = await chessController.createChessGame(gameFields as CreateQuery<ChessDoc>);
  if (!newGame) return;
  socket.emit('new_game', newGame.toJSON());

  console.log('id', newGame._id);

  // Pregame phase
  console.log('taking in bets');
  await delay(PREGAME_TIME * 1000);

  // Start game
  console.log('starting new game', newGame.toJSON());
  const updatedGame = await chessController.updateChessGame(newGame._id, { game_status: GameStatus.IN_PROGRESS });
  if (!updatedGame) return;

  // Play game
  let [whiteTime, blackTime] = [gameTime, gameTime];
  const chessGame = new Chess();
  console.log(chessGame.ascii());
  game.moves.forEach(async (move, i) => {
    // calculate delay required to broadcast move
    if (move.is_white) {
      whiteTime = move.time;
    } else {
      blackTime = move.time;
    }
    const waitTime = 2 * gameTime - blackTime - whiteTime + (i * interval);

    const moveWhiteTime = whiteTime;
    const moveBlackTime = blackTime;

    await delay(waitTime * 1000 + i * 5);

    chessGame.move(move.san);
    console.log(i, chessGame.ascii());
    console.log(String(newGame._id));
    socket.to(String(newGame._id)).emit('new_move', chessGame.ascii());
    // socket.to(String(newGame._id)).emit('new_move', { ...move, id: newGame._id });

    microservice
      .getWDL(chessGame.fen(), Math.floor(moveWhiteTime / 2), Math.floor(moveBlackTime / 2))
      .then((res) => {
        if (res) { socket.to(String(newGame._id)).emit('wagers', res); console.log(res); }
      });

    const gameUpdate: UpdateQuery<ChessDoc> = {
      state: chessGame.fen(),
      move_hist: chessGame.history() as Types.Array<string>,
      time_white: whiteTime,
      time_black: blackTime,
    };

    chessController.updateChessGame(updatedGame._id, gameUpdate);
  });

  // still need to wait for game to finish as forloop runs instantly
  await delay((gameTimeLength) * 1000);

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

export const run300Loop = runLoop(300, 0, data300);
export const run900Loop = runLoop(900, 10, data900);
