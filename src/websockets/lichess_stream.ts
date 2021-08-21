import ndjson from 'ndjson';
import { StreamData } from 'types/lichess';
import {
  AnonMoveWager, CreateChessQuery, GameSource, GameStatus, MoveData,
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
import { getLichessOutcome } from 'helpers/chess_logic';
import { isGameComplete } from 'validation/chess';

const logError = (e: Error) => console.log('Error', e.message);

export const getStream = async (
  id: string,
  startData: CreateChessQuery,
  socket: Namespace<ChessListenEvents, ChessEmitEvents>,
  onGameComplete = () => {},
): Promise<string> => {
  const chessDoc = await chessService.createChessGame(startData);
  socket.emit('new_game', chessDoc.toJSON());
  const gameId = String(chessDoc._id);

  const stream = await lichessService.getGameStream(id);

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
          const outcome = getLichessOutcome((d as any).winner);
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
    .on('end', async () => {
      const gameDoc = await chessService.getChessGame(gameId);
      const completeFields = {
        complete: true,
        game_status: !isGameComplete(gameDoc.game_status)
          ? gameDoc.game_status
          : GameStatus.ABORTED,
      };
      socket.to(gameId).emit('game_over', { gameId, ...completeFields });
      await chessService.updateChessGame(gameId, completeFields);
      setTimeout(onGameComplete, 100);
    });

  return gameId;
};

export const streamLoop = async (socket: Namespace<ChessListenEvents, ChessEmitEvents>): Promise<void> => {
  try {
    const selectedGame = await lichessService.getTopGame();

    const gameFields = lichessService.createChessModelFields(selectedGame, GameSource.LOOP);

    getStream(selectedGame.id, gameFields, socket, () => streamLoop(socket));
  } catch (error) {
    console.log(error);
    setTimeout(() => streamLoop(socket), 100);
  }
};
