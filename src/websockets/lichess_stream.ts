
import ndjson from 'ndjson';
import { StreamData } from '../types/lichess';
import {
  AnonMoveWager, ChessDoc, CreateChessQuery, GameSource, GameStatus, MoveData,
} from '../types/models/chess';
import { matchesSchema } from '../validation';
import { StreamEndSchema, StreamMoveSchema, StreamStartSchema, StatusEventSchema, sanitizeLichessGame } from '../validation/lichess'; // ✅ import added
import { LichessStreamMove, LichessStatusEvent } from '../types/lichess';
import { Types } from 'mongoose';
import { Chess } from 'chess.js';
import { cancelCriticalMoveWagers, resolveCriticalMoveWagers, resolveWdlWagers } from '../helpers/resolve_bets';
import { chessService, microserviceService, agentService } from '../services';
import { ChessEmitEvents, ChessListenEvents } from '../types/websocket';
import { Namespace } from 'socket.io';
import lichessService from '../services/lichess_service';
import { getLichessOutcome } from '../helpers/chess_logic';

export const getStream = async (
  id: string,
  startData: CreateChessQuery,
  socket: Namespace<ChessListenEvents, ChessEmitEvents>,
  onGameComplete = () => {},
): Promise<string> => {
  const chessDoc = await chessService.createChessGame(startData);
  socket.emit('new_game', chessDoc as ChessDoc);
  const gameId = String(chessDoc._id);

  const stream = await lichessService.getGameStream(id);

  const moveHist: MoveData[] = [];
  const gameTime = startData.time_white ?? 600;
  let liveTopMoves: string[] = chessDoc.pool_wagers.move.options.map(String);
  const game = new Chess();

  let canQueryMicroservice = false;
  let startFen = '';

  // Set timeout to 10 minutes (600000ms) instead of 5 minutes for longer games
  const STALE_GAME_TIMEOUT = 600000; // 10 minutes in milliseconds
  const staleGameTime = setTimeout(async () => {
    console.log(`Game ${gameId} stale, terminating stream after ${STALE_GAME_TIMEOUT/60000} minutes of inactivity`);
    stream.destroy();
  }, STALE_GAME_TIMEOUT);

  stream.pipe(ndjson.parse())
    .on('data', async (d: StreamData) => {
      staleGameTime.refresh();
      try {
        if (matchesSchema(StreamStartSchema, d)) {
          startFen = d.fen.split(' ').slice(0, 2).join(' ');
          chessService.updateChessGame(gameId, { game_status: GameStatus.IN_PROGRESS });
          socket.to(gameId).emit('start_game', { gameId, game_status: GameStatus.IN_PROGRESS });
        } else if (matchesSchema(StreamMoveSchema, d)) {
          const moveData = d as LichessStreamMove;

          if (!canQueryMicroservice) canQueryMicroservice = true;
          // if (!canQueryMicroservice && startFen === moveData.fen) canQueryMicroservice = true;

          if (moveData.lm === undefined) return;

          // Try regular move first
          let move = game.move(moveData.lm, { sloppy: true });

          // If move fails, check if it's a castling move and try alternative notation
          if (!move) {
            console.warn(`[Move Failed] gameId=${gameId} move="${moveData.lm}" fen="${moveData.fen}"`);

            // Map of UCI castling moves to algebraic notation
            const castlingMap: {[key: string]: string} = {
              'e1g1': 'O-O',     // White kingside
              'e1c1': 'O-O-O',   // White queenside
              'e8g8': 'O-O',     // Black kingside
              'e8c8': 'O-O-O'    // Black queenside
            };

            // Check if it's a castling move and try the algebraic notation
            if (castlingMap[moveData.lm]) {
              console.log(`[Castling] Attempting to process castling move using algebraic notation: ${castlingMap[moveData.lm]}`);
              try {
                move = game.move(castlingMap[moveData.lm]);
                if (move) {
                  console.log(`[Castling] Successfully processed castling move`);
                } else {
                  console.warn(`[Castling] Failed to process with algebraic notation`);
                }
              } catch (e) {
                console.warn(`[Castling] Error processing castling move: ${e.message}`);
              }
            }

            // If all attempts fail, fall back to loading the FEN
            if (!move) {
              // Use the full FEN string from Lichess instead of appending incomplete data
              // Lichess FEN strings include all needed information including castling rights
              game.load(moveData.fen);
              console.log(`[FEN Loaded] Using Lichess FEN: ${moveData.fen}`);
              return;
            }
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
            time: isWhite ? moveData.wc : moveData.bc,
          });

          const update = {
            state: game.fen(),
            move_hist: [...moveHist] as Types.Array<MoveData>,
            time_white: moveData.wc,
            time_black: moveData.bc,
            pool_wagers: {
              move: {
                wagers: [] as unknown as Types.Array<AnonMoveWager>,
                options: [] as unknown as Types.Array<string>,
              },
            },
          };
          const history = moveHist.map((m) => m.san);
          const actualMove = history[history.length - 1];

          if (process.env.NODE_ENV !== 'test') {
            console.log(`[Move Resolution] Game ${gameId} move ${history.length}: ${actualMove}, available options: [${liveTopMoves.join(', ')}]`);
          }

          chessService.updateChessGame(gameId, update);
          socket.to(gameId).emit('new_move', { gameId, ...update });

          // Save current betting options before updating to new position
          const previousMoveOptions = [...liveTopMoves];

          // Trigger bot wagers for the new position
          agentService.processBotWagersForGame(gameId, socket).catch(err => {
            if (process.env.NODE_ENV !== 'test') {
              console.log(`Bot wager processing error: ${err.message}`);
            }
          });

          (previousMoveOptions.length > 0
            ? resolveCriticalMoveWagers(gameId, history, previousMoveOptions)
            : cancelCriticalMoveWagers(gameId, history))
            .then((wagerResults) => {
              if (process.env.NODE_ENV !== 'test') {
                console.log(`[Wager Resolution] Game ${gameId} - ${Object.keys(wagerResults).length} users affected, topMoves: ${previousMoveOptions.length > 0 ? previousMoveOptions.join(',') : 'none'}`);
                Object.entries(wagerResults).forEach(([uid, wagers]) => {
                  console.log(`[Wager Resolution] Sending to user ${uid}: ${wagers.length} wagers, statuses: ${wagers.map(w => w.status).join(',')}`);
                });
              }
              Object.entries(wagerResults).forEach(([uid, wagers]) => socket.to(uid).emit('wager_result', { gameId, wagers }));
            })
            .catch((e) => console.log('Error:', e.message));

          liveTopMoves = [];

          // console.log('⚙️ Checking canQueryMicroservice:', canQueryMicroservice, '| startFen:', startFen, '| moveFen:', moveData.fen);
          if (canQueryMicroservice) {
            const oddsPromise = microserviceService
              .getWDL(game.fen(), Math.floor((moveData.wc / gameTime) * 180), Math.floor((moveData.bc / gameTime) * 180))
              .catch(() => ({ white_win: 0.0, draw: 0.0, black_win: 0.0 }));
            const topMovesPromise = microserviceService
              .getTopMoves(game.fen(), 3)
              .catch(() => []);

            const [odds, topMoves] = await Promise.all([oddsPromise, topMovesPromise]);
            // if (!topMoves.length) {
            //   console.warn(`[topMoves] EMPTY for gameId=${gameId} →`, game.fen());
            // } else {
            //   console.log(`[topMoves] gameId=${gameId} →`, topMoves);
            // }
            liveTopMoves = topMoves.map(move => move.move);

            const oddsUpdate = {
              odds,
              pool_wagers: {
                move: {
                  wagers: [] as unknown as Types.Array<AnonMoveWager>,
                  options: topMoves.map(move => move.move) as Types.Array<string>,
                },
              },
            };

            chessService.updateChessGame(gameId, oddsUpdate);
            // console.log(`🛰️ Emitting new_odds to gameId=${gameId} →`, oddsUpdate);
            socket.to(gameId).emit('new_odds', { gameId, ...oddsUpdate });
          }
        } else if (matchesSchema(StreamEndSchema, d)) {
          // allow .on('end') to handle game ending
        } else if (matchesSchema(StatusEventSchema, d)) {
          // Use type assertion to properly handle status events
          const statusEvent = d as LichessStatusEvent;

          // Handle status events like "resign", "mate", or "started"
          if (statusEvent.status.name === 'resign') {
            // Game has ended by resignation, will be handled by .on('end')
            console.log(`Game ${gameId} ended by resignation`);
          } else if (statusEvent.status.name === 'mate') {
            // Game has ended by checkmate, will be handled by .on('end')
            console.log(`Game ${gameId} ended by checkmate, winner: ${statusEvent.winner}`);
          } else if (statusEvent.status.name === 'started') {
            // Game has started
            startFen = statusEvent.fen.split(' ').slice(0, 2).join(' ');
            chessService.updateChessGame(gameId, { game_status: GameStatus.IN_PROGRESS });
            socket.to(gameId).emit('start_game', { gameId, game_status: GameStatus.IN_PROGRESS });
          } else {
            // Log other status events for debugging
            console.log(`Game ${gameId} status event: ${statusEvent.status.name}`);
          }
        } else {
          console.warn('FAIL: Unrecognized Lichess stream event', JSON.stringify(d, null, 2));
        }
      } catch (error) {
        console.log('Error:', error.message);
        socket.emit('game_error', { gameId, message: error.message });
      }
    })
    .on('end', async () => {
      try {
        clearTimeout(staleGameTime);

        const gameResult = await lichessService.getGame(id);
        const gameStatus = gameResult.status === 'started'
          ? GameStatus.ABORTED
          : getLichessOutcome(gameResult.winner ?? '');

        const completeFields = {
          complete: true,
          game_status: gameStatus,
        };
        socket.to(gameId).emit('game_over', { gameId, ...completeFields });
        await chessService.updateChessGame(gameId, completeFields);
        setTimeout(onGameComplete, 100);

        resolveWdlWagers(gameId, gameStatus)
          .then((wagerResults) => Object.entries(wagerResults).forEach(([uid, wagers]) => socket.to(uid).emit('wager_result', { gameId, wagers })))
          .catch((e) => console.log('Error:', e.message));
      } catch (error) {
        console.log('Error:', error.message);
      }
    });

  return gameId;
};

export const streamLoop = async (socket: Namespace<ChessListenEvents, ChessEmitEvents>): Promise<void> => {
  try {
    const selectedGame = await lichessService.getTopGame();
    const sanitizedGame = sanitizeLichessGame(selectedGame); // ✅ sanitize before use

    const gameFields = lichessService.createChessModelFields(sanitizedGame, GameSource.LOOP);

    getStream(sanitizedGame.id, gameFields, socket, () => streamLoop(socket));
  } catch (error) {
    console.log(error);
    setTimeout(() => streamLoop(socket), 100);
  }
};

