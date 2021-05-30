/* eslint-disable no-await-in-loop */
/* eslint-disable no-restricted-syntax */
import { Namespace } from 'socket.io';
import { CreateQuery, UpdateQuery, Types } from 'mongoose';
import { Chess } from 'chess.js';
import { cancelCriticalMoveWagers, resolveCriticalMoveWagers, resolveWdlWagers } from 'helpers/resolve_bets';
import { ReplaySchema, GameData } from 'types/game_loop';
import { chessService, microservice } from 'services';

import data300 from 'assets/game_data_300.json';
import data900 from 'assets/game_data_900.json';
import { ChessEmitEvents, ChessListenEvents } from 'types/websocket';
import { delay } from 'helpers/utils';
import {
  AnonMoveWager, ChessDoc, GameStatus, MoveData,
} from 'types/models/chess';

const PREGAME_TIME = 90;

const getRandomGameData = (data: ReplaySchema[], gameTime: number, interval: number): GameData => {
// select random game
  const gameSelection = Math.floor(Math.random() * data.length);
  const game: ReplaySchema = data[gameSelection];

  // calculate time length of game
  const [lastWhiteMove, lastBlackMove] = game.moves.slice(-2);
  const gameTimeLength = 2 * gameTime - lastWhiteMove.time - lastBlackMove.time + (game.moves.length * interval);

  return { game, gameTimeLength };
};

const runLoop = (gameTime: number, increment: number, data: ReplaySchema[]) => async (socket: Namespace<ChessListenEvents, ChessEmitEvents>): Promise<boolean> => {
  // get game data
  const { game, gameTimeLength } = getRandomGameData(data, gameTime, increment);

  // start new game two minutes before this one finishes
  // This may seem that it causes recursion, but it does not https://stackoverflow.com/questions/13506852/infinite-timer-loop-with-javascript-no-setinterval/13506904#13506904
  setTimeout(() => runLoop(gameTime, increment, data)(socket), (gameTimeLength - (PREGAME_TIME / 2)) * 1000);

  const gameFields = {
    player_white: game.white,
    player_black: game.black,
    time_format: `${gameTime}+${increment}`,
    time_white: gameTime,
    time_black: gameTime,
  };
  // create game and put into pregame
  const gameDoc = await chessService.createChessGame(gameFields as CreateQuery<ChessDoc>);
  if (!gameDoc) return socket.emit('socket_error', { message: 'There was an issue creating a new game' });
  const gameId = String(gameDoc._id);
  socket.emit('new_game', gameDoc.toJSON());

  // Pregame phase
  await delay(PREGAME_TIME * 1000);

  // Start game
  const updatedGame = await chessService.updateChessGame(gameDoc._id, { game_status: GameStatus.IN_PROGRESS });
  if (!updatedGame) return socket.emit('game_error', { gameId, message: 'There was an issue starting the game' });
  socket.to(gameId).emit('start_game', { gameId, game_status: GameStatus.IN_PROGRESS });

  // Play game
  let [whiteTime, blackTime] = [gameTime, gameTime];
  const chessGame = new Chess();
  const moveHist: MoveData[] = [];
  let liveTopMoves = updatedGame.pool_wagers.move.options.map(String);
  let liveTopMovesNumber = 1;

  try {
    for (const [i, move] of Array.from(game.moves.entries())) {
      // const move = game.moves[i];
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

      moveHist.push(move);

      const updateMessage = {
        state: chessGame.fen(),
        move_hist: [...moveHist] as Types.Array<MoveData>,
        time_white: whiteTime,
        time_black: blackTime,
        pool_wagers: {
          move: {
            wagers: [] as unknown as Types.Array<AnonMoveWager>,
            options: [] as unknown as Types.Array<string>,
          },
        },
      };

      socket.to(gameId).emit('new_move', { gameId, ...updateMessage });

      // update gameDoc
      chessService.updateChessGame(gameDoc._id, updateMessage);

      // resolve wagers on the move just played, if any
      // safety check to see if topMoves are valid
      const validTopMoves = liveTopMovesNumber === moveHist.length && liveTopMoves.length > 0;

      (validTopMoves
        ? resolveCriticalMoveWagers(gameId, chessGame, liveTopMoves)
        : cancelCriticalMoveWagers(gameId, chessGame))
        .then((wagerResults) => {
          if (wagerResults) Object.entries(wagerResults).forEach(([id, wagers]) => socket.to(id).emit('wager_result', { gameId, wagers }));
          else socket.to(gameId).emit('game_error', { gameId, message: 'There was an error updating critical move wagers' });
        });

      liveTopMoves = [];

      const oddsPromise = microservice
        .getWDL(chessGame.fen(), Math.floor((whiteTime / gameTime) * 180), Math.floor((blackTime / gameTime) * 180))
        .then((res) => res ?? { white_win: 0.0, draw: 0.0, black_win: 0.0 });
      const topMovesPromise = microservice
        .getTopMoves(chessGame.fen(), 3)
        .then((res) => res ?? []);

      // eslint-disable-next-line @typescript-eslint/no-loop-func
      Promise.all([oddsPromise, topMovesPromise]).then(([odds, topMoves]) => {
        liveTopMoves = topMoves;
        liveTopMovesNumber = i + 2;
        const oddsUpdate = {
          odds,
          pool_wagers: {
            move: {
              wagers: [] as unknown as Types.Array<AnonMoveWager>,
              options: topMoves as Types.Array<string>,
            },
          },
        };

        socket.to(gameId).emit('new_odds', { gameId, ...oddsUpdate });

        chessService.updateChessGame(gameDoc._id, oddsUpdate);
      });
    }

    const completeFields: UpdateQuery<ChessDoc> = {
      game_status: game.outcome,
      complete: true,
    };
    socket.to(gameId).emit('game_over', { gameId, ...completeFields });
    await chessService.updateChessGame(gameDoc._id, completeFields);

    resolveWdlWagers(gameId, game.outcome)
      .then((wagerResults) => {
        if (wagerResults) Object.entries(wagerResults).forEach(([id, wagers]) => socket.to(id).emit('wager_result', { gameId, wagers }));
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
