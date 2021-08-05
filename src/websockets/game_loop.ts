/* eslint-disable no-await-in-loop */
/* eslint-disable no-restricted-syntax */
import { Namespace } from 'socket.io';
import { UpdateQuery, Types } from 'mongoose';
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

/**
 * Fetch random game from static data
 * @param data static JSON
 * @param gameTime time format
 * @param interval time format
 * @returns game recording and time length of game
 */
const getRandomGameData = (data: ReplaySchema[], gameTime: number, interval: number): GameData => {
// select random game
  const gameSelection = Math.floor(Math.random() * data.length);
  const game: ReplaySchema = data[gameSelection];

  // calculate time length of game
  const [lastWhiteMove, lastBlackMove] = game.moves.slice(-2);
  const gameTimeLength = 2 * gameTime - lastWhiteMove.time - lastBlackMove.time + (game.moves.length * interval);

  return { game, gameTimeLength };
};

/**
 * Run loop that broadcasts random games
 * @param gameTime time format
 * @param increment time format
 * @param data corresponding to time format
 * @param socket from `/chessws` namespace
 *
 * Procedure
 *   - Get random game from `data`
 *   - Set up next call of `runLoop()` based on length of selected game
 *   - Create new game in database
 *   - Wait for pregame time to conclude
 *   - For each `move` in selected game
 *     - Determine time user took to make move, wait that long
 *     - Update game with respect to `move`
 *     - Broadcast update
 *     - Resolve move wagers, broadcast results to each user
 *     - Get new odds and move options from microservice. With resulting data, update game and broadcast
 *   - Broadcast that game is over
 *   - Resolve win/draw/loss wagers, broadcast results to each user
 */
const runLoop = (gameTime: number, increment: number, data: ReplaySchema[]) => async (socket: Namespace<ChessListenEvents, ChessEmitEvents>): Promise<boolean> => {
  // get game data
  const { game, gameTimeLength } = getRandomGameData(data, gameTime, increment);

  // start new loop PREGAME_TIME/2 seconds before this one finishes
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
  const gameDoc = await chessService.createChessGame(gameFields);
  const gameId = String(gameDoc._id);
  socket.emit('new_game', gameDoc.toJSON());

  // Pregame phase
  await delay(PREGAME_TIME * 1000);

  // Start game
  const updatedGame = await chessService.updateChessGame(gameDoc._id, { game_status: GameStatus.IN_PROGRESS });
  if (!updatedGame) return false;
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
      const { to, from } = moveResult;

      moveHist.push({ ...move, to, from });

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

      // Resolve move bets if options valid, otherwise cancel bets
      (validTopMoves
        ? resolveCriticalMoveWagers(gameId, chessGame.history(), liveTopMoves)
        : cancelCriticalMoveWagers(gameId, chessGame.history()))
        .then((wagerResults) => Object.entries(wagerResults).forEach(([id, wagers]) => socket.to(id).emit('wager_result', { gameId, wagers })));

      // reset top moves
      liveTopMoves = [];

      // Get new odds from microservice
      const oddsPromise = microservice
        .getWDL(chessGame.fen(), Math.floor((whiteTime / gameTime) * 180), Math.floor((blackTime / gameTime) * 180))
        .catch(() => ({ white_win: 0.0, draw: 0.0, black_win: 0.0 }));
      const topMovesPromise = microservice
        .getTopMoves(chessGame.fen(), 3)
        .catch(() => []);

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

        // Broadcast new odds, save to database
        socket.to(gameId).emit('new_odds', { gameId, ...oddsUpdate });
        chessService.updateChessGame(gameDoc._id, oddsUpdate);
      });
    }

    // Broadcast that game is complete, save to database
    const completeFields: UpdateQuery<ChessDoc> = {
      game_status: game.outcome,
      complete: true,
    };
    socket.to(gameId).emit('game_over', { gameId, ...completeFields });
    await chessService.updateChessGame(gameDoc._id, completeFields);

    // Resolve win/draw/loss wagers
    resolveWdlWagers(gameId, game.outcome)
      .then((wagerResults) => Object.entries(wagerResults).forEach(([id, wagers]) => socket.to(id).emit('wager_result', { gameId, wagers })));
  } catch (error) {
    console.log('Error:', error.message);
    socket.emit('game_error', { gameId, message: error.message });
  }

  return true;
};

export const run300Loop = runLoop(300, 0, data300 as ReplaySchema[]);
export const run900Loop = runLoop(900, 10, data900 as ReplaySchema[]);
