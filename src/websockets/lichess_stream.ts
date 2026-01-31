
import ndjson from 'ndjson';
import { StreamData } from '../types/lichess';
import {
  AnonMoveWager, ChessDoc, CreateChessQuery, GameSource, GameStatus, MoveData,
} from '../types/models/chess';
import { matchesSchema } from '../validation';
import { StreamEndSchema, StreamMoveSchema, StreamStartSchema, StatusEventSchema, sanitizeLichessGame } from '../validation/lichess'; // ✅ import added
import { LichessStreamMove, LichessStatusEvent } from '../types/lichess';
import { Types } from 'mongoose';
import { Chess as ChessGame } from 'chess.js';
import { Chess } from '../models';
import { cancelCriticalMoveWagers, resolveCriticalMoveWagers, resolveWdlWagers } from '../helpers/resolve_bets';
import { chessService, microserviceService, moveBadgeService } from '../services';
import moveBadgeConfig from '../config/move_badges';
import dominanceTracker from '../services/dominance_tracker';
import { ChessEmitEvents, ChessListenEvents } from '../types/websocket';
import { Namespace } from 'socket.io';
import lichessService from '../services/lichess_service';
import featuredSelector from '../services/featured_selector';
import { getLichessOutcome } from '../helpers/chess_logic';
import { twitterService } from '../services';
import logger from '../helpers/logger';

// Backoff state for resilient Lichess polling/stream loop
let consecutiveErrors = 0;
let cooldownUntil = 0; // epoch ms until next attempt allowed

function parseRetryAfter(header?: string | number): number | null {
  if (!header && header !== 0) return null;
  try {
    if (typeof header === 'number') return Math.max(0, header) * 1000;
    const s = String(header).trim();
    const secs = Number(s);
    if (Number.isFinite(secs)) return Math.max(0, secs) * 1000;
    const dateMs = Date.parse(s);
    if (!Number.isNaN(dateMs)) return Math.max(0, dateMs - Date.now());
  } catch {}
  return null;
}

function backoffDelay(kind: '429' | '5xx' | 'nocandidates' | 'network' | 'unknown'): number {
  // Base windows
  if (kind === 'nocandidates') return 15000 + Math.floor(Math.random() * 5000); // 15–20s
  if (kind === '429') return 60000 + Math.floor(Math.random() * 10000); // 60–70s

  const capped = Math.min(consecutiveErrors, 6); // cap exponent growth
  const base = 2000 * Math.pow(2, capped); // 2s, 4s, 8s, ... up to ~128s
  const jitter = Math.floor(Math.random() * 1000);
  const max = 120000; // 2 minutes
  const delay = Math.min(base + jitter, max);
  return delay;
}

const verboseGameLogs = process.env.LOG_GAME_EVENTS === 'true';

export const getStream = async (
  id: string,
  startData: CreateChessQuery,
  socket: Namespace<ChessListenEvents, ChessEmitEvents>,
  onGameComplete = () => {},
): Promise<string> => {
  const chessDoc = await chessService.createChessGame(startData);
  socket.emit('new_game', chessDoc as ChessDoc);
  const gameId = String(chessDoc._id);

  // We'll use a delay for tweeting to ensure the game is properly created and available
  // This helps prevent race conditions during deployments and cold starts

  // Store deployment/boot timestamp in a global variable if not already set
  if (!(global as any).serverStartTime) {
    (global as any).serverStartTime = Date.now();
  }

  // Don't tweet during first 30 seconds after server start (deployment/cold boot)
  const isFreshBoot = Date.now() - (global as any).serverStartTime < 30000;

  if (twitterService.isConfigured() && !isFreshBoot) {
    // Delay the tweet to ensure game is available in frontend and stored in DB
    setTimeout(async () => {
      try {
        // Verify game still exists and is the latest active game before tweeting
        const gameExists = await chessService.getChessGame(gameId);

        // Get the latest active game
        const latestGames = await chessService.getActiveGames(0, 1);
        const latestGame = latestGames && latestGames.length > 0 ? latestGames[0] : null;

        if (gameExists && latestGame && latestGame._id.toString() === gameId) {
          console.log(`Verified game ${gameId} exists and is latest active game, proceeding with tweet`);
          twitterService.tweetNewGame(
            gameId,
            startData.player_white?.name || 'Anonymous',
            startData.player_black?.name || 'Anonymous',
            `${Math.floor((startData.time_white || 600)/60)}+0` // Assuming 0 increment
          ).catch(error => {
            console.warn(`Failed to tweet about new game ${gameId}:`, error.message);
          });
        } else if (!gameExists) {
          console.warn(`Skipping tweet: game ${gameId} not found`);
        } else if (!latestGame || latestGame._id.toString() !== gameId) {
          console.warn(`Skipping tweet: game ${gameId} is not the latest active game (latest is ${latestGame?._id})`);
          console.log(`Game creation race condition detected - tweet target: ${gameId}, latest game: ${latestGame?._id}`);
        } else {
          console.warn(`Skipping tweet: game ${gameId} validation failed for unknown reason`);
        }
      } catch (error) {
        console.warn(`Failed to verify game ${gameId} before tweeting:`, error.message);
      }
    }, 5000); // 5 second delay to ensure game is persisted and available
  } else if (isFreshBoot) {
    console.log(`Skipping tweet for game ${gameId}: server recently started/deployed`);
  }

  const stream = await lichessService.getGameStream(id);

  const moveHist: MoveData[] = [];
  const gameTime = startData.time_white ?? 600;
  let liveTopMoves: string[] = chessDoc.pool_wagers.move.options.map(String);
  const game = new ChessGame();

  let canQueryMicroservice = false;
  let markedStarted = false; // Fallback: mark game in progress on first move if start event is missed
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
          // If we never received an explicit start event from the stream, mark as in_progress on first move
          if (!markedStarted) {
            markedStarted = true;
            chessService.updateChessGame(gameId, { game_status: GameStatus.IN_PROGRESS });
            socket.to(gameId).emit('start_game', { gameId, game_status: GameStatus.IN_PROGRESS });
          }
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
            if (verboseGameLogs) {
              logger.log({ level: 'debug', event: 'castling_attempt', context: { gameId, move: castlingMap[moveData.lm] } });
            }
              try {
                move = game.move(castlingMap[moveData.lm]);
                if (move) {
                  if (verboseGameLogs) {
                    logger.log({ level: 'debug', event: 'castling_success', context: { gameId } });
                  }
                } else {
                  if (verboseGameLogs) {
                    logger.log({ level: 'debug', event: 'castling_failed_algebraic', context: { gameId } });
                  }
                }
              } catch (e) {
                logger.log({ level: 'warn', event: 'castling_error', context: { gameId, error: (e as Error).message } });
              }
            }

            // If all attempts fail, fall back to loading the FEN
            if (!move) {
              // Use the full FEN string from Lichess instead of appending incomplete data
              // Lichess FEN strings include all needed information including castling rights
              game.load(moveData.fen);
              if (verboseGameLogs) {
                logger.log({ level: 'debug', event: 'fen_loaded', context: { gameId } });
              }
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

          if (verboseGameLogs) {
            logger.log({
              level: 'debug',
              event: 'move_resolution',
              context: { gameId, moveNumber: history.length, actualMove, topMoves: liveTopMoves }
            });
          }

          chessService.updateChessGame(gameId, update);
          socket.to(gameId).emit('new_move', { gameId, ...update });

          // Save current betting options before updating to new position
          const previousMoveOptions = [...liveTopMoves];

          // Bot wagers removed

          (previousMoveOptions.length > 0
            ? resolveCriticalMoveWagers(gameId, history, previousMoveOptions)
            : cancelCriticalMoveWagers(gameId, history))
            .then((wagerResults) => {
              const affectedUsers = Object.keys(wagerResults).length;
              if (affectedUsers > 0 || verboseGameLogs) {
                logger.log({
                  level: affectedUsers > 0 ? 'info' : 'debug',
                  event: 'wager_resolution',
                  context: {
                    gameId,
                    affectedUsers,
                    topMoves: previousMoveOptions,
                    moveNumber: history.length,
                    actualMove
                  }
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

            // Compute badge metadata using SAN history + dominated persistence
            const maxp = Math.max(Number(odds.white_win || 0), Number(odds.black_win || 0), Number(odds.draw || 0));
            const dominatedNow = (moveBadgeConfig.dominated.enable && maxp >= moveBadgeConfig.dominated.probThreshold);
            const persistedDominated = dominanceTracker.update(gameId, dominatedNow);
            const badgeMeta = moveBadgeService.resolveBadgesForTopMoves(
              game.fen(),
              history.length + 1,
              odds,
              (topMoves as any),
              history,
              persistedDominated,
            );

            const oddsUpdate = {
              odds,
              pool_wagers: {
                move: {
                  wagers: [] as unknown as Types.Array<AnonMoveWager>,
                  options: topMoves.map(move => move.move) as Types.Array<string>,
                },
              },
              badge_meta: badgeMeta,
            };

            chessService.updateChessGame(gameId, oddsUpdate);
            // console.log(`🛰️ Emitting new_odds to gameId=${gameId} →`, oddsUpdate);
            socket.to(gameId).emit('new_odds', { gameId, ...oddsUpdate });
          }
        } else if ((d as any)?.type === 'gameFull') {
          // Lichess sends a gameFull object at stream start
          try {
            const full: any = d;
            const fen = full?.state?.fen || full?.fen || '';
            if (fen) startFen = String(fen).split(' ').slice(0, 2).join(' ');
            chessService.updateChessGame(gameId, { game_status: GameStatus.IN_PROGRESS });
            socket.to(gameId).emit('start_game', { gameId, game_status: GameStatus.IN_PROGRESS });
          } catch {}
        } else if ((d as any)?.type === 'gameState') {
          // State updates without full move payload; ignore for now (handled by explicit move events)
          if (verboseGameLogs) {
            logger.log({ level: 'debug', event: 'lichess_game_state', context: { gameId } });
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
          // Downgrade to debug to avoid noise during normal stream messages
          if (verboseGameLogs) {
            logger.log({ level: 'debug', event: 'lichess_unrecognized_event', context: { keys: Object.keys(d || {}), sample: JSON.stringify(d).slice(0, 200) } });
          }
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

        // Game-ended tweets have been disabled
        // We only tweet about new games and significant betting events now
        console.log(`Game ${gameId} completed with result: ${gameStatus}`);
      } catch (error) {
        console.log('Error:', error.message);
      }
    });

  return gameId;
};

export const streamLoop = async (socket: Namespace<ChessListenEvents, ChessEmitEvents>): Promise<void> => {
  try {
    // Respect any active cooldown
    const now = Date.now();
    if (cooldownUntil > now) {
      const waitMs = cooldownUntil - now;
      try {
        logger.log({ level: 'debug', event: 'lichess_cooldown_wait', context: { wait_ms: waitMs, consecutive_errors: consecutiveErrors } });
      } catch {}
      setTimeout(() => streamLoop(socket), waitMs);
      return;
    }

    // Check for existing active games before creating a new one
    const activeGames = await chessService.getActiveGames(0, 10);
    const inProgressGames = activeGames.filter(game => game.game_status === GameStatus.IN_PROGRESS);

    console.log(`Found ${activeGames.length} active games, ${inProgressGames.length} in progress`);

    // Check for stale games - games that haven't been updated in more than 10 minutes
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
    const staleGames = inProgressGames.filter(game => {
      const lastUpdated = game.updated_at || game.created_at;
      return lastUpdated < tenMinutesAgo;
    });

    // If there are stale games, mark them as complete so they don't block new game creation
    if (staleGames.length > 0) {
      console.log(`Found ${staleGames.length} stale games that haven't been updated in over 10 minutes`);

      // Mark stale games as complete with ABORTED status
      await Promise.all(staleGames.map(game =>
        chessService.updateChessGame(game._id.toString(), {
          complete: true,
          game_status: GameStatus.ABORTED
        })
      ));

      console.log(`Marked ${staleGames.length} stale games as complete with ABORTED status`);

      // Re-fetch the active games after cleanup
      const updatedActiveGames = await chessService.getActiveGames(0, 10);
      const updatedInProgressGames = updatedActiveGames.filter(game => game.game_status === GameStatus.IN_PROGRESS);

      // If we still have non-stale in-progress games, respect them
      if (updatedInProgressGames.length > 0) {
        console.log(`Still have ${updatedInProgressGames.length} non-stale games in progress, skipping new game creation`);
        // Check again after a delay
        setTimeout(() => streamLoop(socket), 30000); // Check again in 30 seconds
        return;
      }
    } else if (inProgressGames.length > 0) {
      // If there are active non-stale games in progress, don't create a new one
      console.log(`Games already in progress, skipping new game creation`);
      // Check again after a delay
      setTimeout(() => streamLoop(socket), 30000); // Check again in 30 seconds
      return;
    }

    // Proceed with creating a new game
    const useSmartSelector = String(process.env.FEATURED_SELECTOR_ENABLED || '').toLowerCase() === 'true';
    const selectedGame = useSmartSelector
      ? await featuredSelector.selectFeaturedGame()
      : await lichessService.getTopGame();
    const sanitizedGame = sanitizeLichessGame(selectedGame); // ✅ sanitize before use

    const gameFields = lichessService.createChessModelFields(sanitizedGame, GameSource.LOOP);

    // Success path: reset error counters and start stream
    consecutiveErrors = 0;
    cooldownUntil = 0;
    getStream(sanitizedGame.id, gameFields, socket, () => streamLoop(socket));
  } catch (error) {
    // Derive error classification and decide backoff
    let kind: '429' | '5xx' | 'nocandidates' | 'network' | 'unknown' = 'unknown';
    let waitMs: number | null = null;
    let status: number | null = null;
    try {
      status = (error as any)?.response?.status ?? null;
      const message = (error as any)?.message || String(error);
      if (status === 429) {
        kind = '429';
        const ra = parseRetryAfter((error as any)?.response?.headers?.['retry-after']);
        waitMs = typeof ra === 'number' ? ra : backoffDelay('429');
      } else if (status && status >= 500) {
        kind = '5xx';
        waitMs = backoffDelay('5xx');
      } else if (/No TV candidates available/i.test(message)) {
        kind = 'nocandidates';
        waitMs = backoffDelay('nocandidates');
      } else if ((error as any)?.code === 'ECONNABORTED' || /timeout/i.test(message) || /ENOTFOUND|EAI_AGAIN|ECONNRESET/i.test(message)) {
        kind = 'network';
        waitMs = backoffDelay('network');
      } else {
        kind = 'unknown';
        waitMs = backoffDelay('unknown');
      }
    } catch {
      kind = 'unknown';
      waitMs = backoffDelay('unknown');
    }

    consecutiveErrors += 1;
    cooldownUntil = Date.now() + (waitMs || 2000);

    try {
      logger.log({ level: kind === '5xx' || kind === 'unknown' ? 'warn' : 'info', event: 'lichess_stream_error_retry', context: {
        kind,
        status,
        wait_ms: waitMs,
        consecutive_errors: consecutiveErrors,
      } });
    } catch {}

    setTimeout(() => streamLoop(socket), waitMs || 2000);
  }
};
