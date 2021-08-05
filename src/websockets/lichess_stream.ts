import axios from 'axios';
import ndjson from 'ndjson';
import { PartialWithRequired } from 'types';
import { LichessGame, StreamData } from 'types/lichess';
import {
  AnonMoveWager, ChessDoc, GameStatus, MoveData,
} from 'types/models/chess';
import { matchesSchema } from 'validation';
import { StreamEndSchema, StreamMoveSchema, StreamStartSchema } from 'validation/lichess';
import { Types } from 'mongoose';
import { Chess } from 'chess.js';
import { cancelCriticalMoveWagers, resolveCriticalMoveWagers, resolveWdlWagers } from 'helpers/resolve_bets';
import { chessService, microservice } from 'services';
import { ChessEmitEvents, ChessListenEvents } from 'types/websocket';
import { Namespace } from 'socket.io';
import lichessService from 'services/lichess_service';
// import { resolveCriticalMoveWagers } from 'helpers/resolve_bets';

const LICHESS_ROOT = 'https://lichess.org/api';

const numMoves = (g: LichessGame) => g.moves.split(' ').length;

const takeLess = <D>(fn: (d: D) => number) => (a: D, b: D): D => (fn(a) > fn(b) ? b : a);

const getOutcome = (o: string): GameStatus => (
  // eslint-disable-next-line no-nested-ternary
  o === 'white' ? GameStatus.WHITE_WIN
    : o === 'black' ? GameStatus.BLACK_WIN
      : GameStatus.DRAW
);

const logError = (e: Error) => console.log('Error', e.message);

export const getStream = async (
  id: string,
  startData: PartialWithRequired<ChessDoc, 'player_white' | 'player_black'>,
  socket: Namespace<ChessListenEvents, ChessEmitEvents>,
): Promise<string> => {
  console.log('creating game with', startData);
  const chessDoc = await chessService.createChessGame(startData);
  socket.emit('new_game', chessDoc.toJSON());
  const gameId = String(chessDoc._id);

  const stream = await lichessService.getStream(id);

  const moveHist: MoveData[] = [];
  const gameTime = 600;
  let liveTopMoves: string[] = chessDoc.pool_wagers.move.options.map(String);
  const game = new Chess();

  stream.pipe(ndjson.parse())
    .on('data', async (d: StreamData) => {
      try {
        if (matchesSchema(StreamStartSchema, d)) {
          chessService.updateChessGame(gameId, { game_status: GameStatus.IN_PROGRESS }).catch(logError);
          socket.to(gameId).emit('start_game', { gameId, game_status: GameStatus.IN_PROGRESS });
        } else if (matchesSchema(StreamMoveSchema, d)) {
          if (d.lm === undefined) return;
          const move = game.move(d.lm, { sloppy: true });
          if (!move) {
            game.load(`${d.fen} - - 0 1`);
            return;
          }

          const {
            color, from, to, san,
          } = move;

          const isWhite = color === 'w';

          moveHist.push({
            from,
            to,
            san,
            is_white: isWhite,
            time: isWhite ? d.wc : d.bc,
          });

          const update = {
            state: game.fen(),
            move_hist: [...moveHist] as Types.Array<MoveData>,
            time_white: d.wc,
            time_black: d.bc,
            pool_wagers: {
              move: {
                wagers: [] as unknown as Types.Array<AnonMoveWager>,
                options: [] as unknown as Types.Array<string>,
              },
            },
          };

          const history = moveHist.map((m) => m.san);

          chessService.updateChessGame(gameId, update).catch(logError);
          socket.to(gameId).emit('new_move', { gameId, ...update });

          (liveTopMoves.length > 0
            ? resolveCriticalMoveWagers(gameId, history, liveTopMoves)
            : cancelCriticalMoveWagers(gameId, history))
            .then((wagerResults) => Object.entries(wagerResults).forEach(([uid, wagers]) => socket.to(uid).emit('wager_result', { gameId, wagers })))
            .catch((e) => console.log('Error:', e.message));

          liveTopMoves = [];

          const oddsPromise = microservice
            .getWDL(game.fen(), Math.floor((d.wc / gameTime) * 180), Math.floor((d.bc / gameTime) * 180))
            .catch(() => ({ white_win: 0.0, draw: 0.0, black_win: 0.0 }));
          const topMovesPromise = microservice
            .getTopMoves(game.fen(), 3)
            .catch(() => []);

          const [odds, topMoves] = await Promise.all([oddsPromise, topMovesPromise]);
          liveTopMoves = topMoves;

          const oddsUpdate = {
            odds,
            pool_wagers: {
              move: {
                wagers: [] as unknown as Types.Array<AnonMoveWager>,
                options: topMoves as Types.Array<string>,
              },
            },
          };

          chessService.updateChessGame(gameId, oddsUpdate).catch(logError);
          socket.to(gameId).emit('new_odds', { gameId, ...oddsUpdate });
        } else if (matchesSchema(StreamEndSchema, d)) {
          const outcome = getOutcome((d as any).winner);
          const completeFields = {
            game_status: outcome,
            complete: true,
          };

          socket.to(gameId).emit('game_over', { gameId, ...completeFields });
          await chessService.updateChessGame(gameId, completeFields);

          // Resolve win/draw/loss wagers
          resolveWdlWagers(gameId, outcome)
            .then((wagerResults) => Object.entries(wagerResults).forEach(([uid, wagers]) => socket.to(uid).emit('wager_result', { gameId, wagers })))
            .catch((e) => console.log('Error:', e.message));
        } else {
          console.log('FAIL', d);
        }
      } catch (error) {
        console.log('Error:', error.message);
        socket.emit('game_error', { gameId, message: error.message });
      }
    })
    .on('end', () => {
      console.log(id, 'ended');
    });

  return gameId;
};

export const findStream = async (socket: Namespace<ChessListenEvents, ChessEmitEvents>): Promise<void> => {
  try {
    const { data } = await axios({
      method: 'GET',
      url: `${LICHESS_ROOT}/tv/rapid`,
      headers: { Accept: 'application/x-ndjson' },
      params: { nb: 30 },
    });

    const games: LichessGame[] = data
      .split('\n')
      .filter((s: string) => s.length > 0)
      .map(JSON.parse);

    const selectedGame = games.reduce(takeLess(numMoves));

    console.log(selectedGame);

    const gameFields = {
      player_white: {
        name: selectedGame.players.white.user.name,
        elo: selectedGame.players.white.rating,
      },
      player_black: {
        name: selectedGame.players.black.user.name,
        elo: selectedGame.players.black.rating,
      },
      time_format: `${selectedGame.clock.totalTime}+${selectedGame.clock.increment}`,
      time_white: selectedGame.clock.initial,
      time_black: selectedGame.clock.initial,
    };

    getStream(selectedGame.id, gameFields, socket);
  } catch (error) {
    console.log(error);
  }
};
