/* eslint-disable no-await-in-loop */
/* eslint-disable no-restricted-syntax */
import { Namespace } from 'socket.io';
import { DefaultEventsMap } from 'socket.io/dist/typed-events';
import { ChessDoc, GameStatus } from 'types/models';
import { chessController } from 'controllers';
import { CreateQuery, UpdateQuery, Types } from 'mongoose';
import { Chess } from 'chess.js';
import { resolveCriticalMoveWagers, resolveWdlWagers } from 'helpers/resolve_bets';
import { ReplaySchema, GameData } from 'types/game_loop';
import { microservice } from 'services';

import data300 from 'assets/game_data_300.json';
import data900 from 'assets/game_data_900.json';

const PREGAME_TIME = 9;

const delay = (ms: number) => new Promise((res) => setTimeout(res, ms));

const getRandomGameData = (data: ReplaySchema[], gameTime: number, interval: number): GameData => {
// select random game
  const gameSelection = Math.floor(Math.random() * data.length);
  const game: ReplaySchema = data[gameSelection];

  // calculate time length of game
  const [lastWhiteMove, lastBlackMove] = game.moves.slice(-2);
  const gameTimeLength = 2 * gameTime - lastWhiteMove.time - lastBlackMove.time + (game.moves.length * interval);

  return { game, gameTimeLength };
};

const runLoop = (gameTime: number, increment: number, data: ReplaySchema[]) => async (socket: Namespace<DefaultEventsMap>): Promise<boolean> => {
  // get game data
  const { game, gameTimeLength } = getRandomGameData(data, gameTime, increment);

  // start new game two minutes before this one finishes
  // This may seem that it causes recursion, but it does not https://stackoverflow.com/questions/13506852/infinite-timer-loop-with-javascript-no-setinterval/13506904#13506904
  setTimeout(() => runLoop(gameTime, increment, data)(socket), (gameTimeLength - (PREGAME_TIME / 2)) * 1000);

  const gameFields = {
    player_white: game.white,
    player_black: game.black,
  };
  // create game and put into pregame
  const gameDoc = await chessController.createChessGame(gameFields as CreateQuery<ChessDoc>);
  if (!gameDoc) return socket.emit('socket_error', { message: 'There was an issue creating a new game' });
  const gameId = String(gameDoc._id);
  socket.emit('new_game', gameDoc.toJSON());

  // Pregame phase
  await delay(PREGAME_TIME * 1000);

  // Start game
  const updatedGame = await chessController.updateChessGame(gameDoc._id, { game_status: GameStatus.IN_PROGRESS });
  if (!updatedGame) return socket.emit('game_error', { gameId, message: 'There was an issue starting the game' });

  // Play game
  let [whiteTime, blackTime] = [gameTime, gameTime];
  const chessGame = new Chess();

  try {
    for (const move of game.moves) {
      // calculate delay required to broadcast move
      const prevTimer = move.is_white ? whiteTime : blackTime;
      const waitTime = prevTimer - move.time + increment;

      // save player's clock
      if (move.is_white) whiteTime = move.time;
      else blackTime = move.time;

      await delay(waitTime * 1000);

      // check if impossible move was made, likely caused by bad delay timing
      const moveResult = chessGame.move(move.san);
      if (!moveResult) throw Error('There was an issue in the game loop');

      const updateMessage = {
        state: chessGame.fen(),
        move_hist: chessGame.history(),
        time_white: whiteTime,
        time_black: blackTime,
      };

      socket.to(gameId).emit('new_move', { gameId, ...updateMessage });

      const odds = await microservice
        .getWDL(chessGame.fen(), Math.floor((whiteTime / gameTime) * 180), Math.floor((blackTime / gameTime) * 180))
        .then((res) => res ?? { white_win: 0.0, draw: 0.0, black_win: 0.0 });

      socket.to(gameId).emit('new_odds', { gameId, odds });

      // update gameDoc
      const gameUpdate: UpdateQuery<ChessDoc> = {
        ...updateMessage,
        move_hist: chessGame.history() as Types.Array<string>,
        odds,
      };

      // don't check if update successful
      chessController.updateChessGame(gameDoc._id, gameUpdate);

      // resolve wagers on the move just played, if any
      resolveCriticalMoveWagers(gameId, chessGame).then((wagerResults) => {
        if (wagerResults) socket.to(gameId).emit('wager_result', { gameId, data: wagerResults.map((w) => w.toJSON()) });
        else socket.to(gameId).emit('game_error', { gameId, message: 'There was an error updating critical move wagers' });
      });
    }

    const completeFields: UpdateQuery<ChessDoc> = {
      game_status: game.outcome,
      complete: true,
    };
    socket.to(gameId).emit('game_over', { gameId, ...completeFields });
    await chessController.updateChessGame(gameDoc._id, completeFields);

    resolveWdlWagers(gameId, game.outcome).then((wagerResults) => {
      if (wagerResults) socket.to(gameId).emit('wager_result', { gameId, data: wagerResults.map((w) => w.toJSON()) });
      else socket.to(gameId).emit('game_error', { gameId, message: 'There was an error updating critical move wagers' });
    });
  } catch (error) {
    console.log('Error:', error.message);
    socket.emit('game_error', { gameId, message: error.message });
  }

  return true;
};

export const run300Loop = runLoop(300, 0, data300 as ReplaySchema[]);
export const run900Loop = runLoop(900, 10, data900 as ReplaySchema[]);
