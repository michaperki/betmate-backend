import { RequestHandler } from 'express';
import { Wager } from '../models';
import { chessService } from '../services';
import { GameSource, GameStatus, MoveData } from '../types/models/chess';
import { Chess as ChessGame } from 'chess.js';
import { resolveCriticalMoveWagers, resolveWdlWagers } from '../helpers/resolve_bets';
import logger from '../helpers/axiom_logger';
import { getChessStatus } from '../helpers/chess_logic';
import { getChessNamespace } from '../websockets/namespace';

export const clearAllWagers: RequestHandler = async (_req, res) => {
  // Danger: dev/staging only. This deletes ALL wagers.
  try {
    const result = await Wager.deleteMany({});
    res.status(200).json({ ok: true, deleted: result?.deletedCount || 0 });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
};

const adminDevController = { clearAllWagers };
export default adminDevController;

// Dev-only: seed a deterministic sample game for E2E tests and manual QA
// Returns { ok: true, game_id }
export const createSampleGame: RequestHandler = async (req, res) => {
  try {
    const {
      fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      white = 'WhiteBot',
      black = 'BlackBot',
      whiteElo = 2400,
      blackElo = 2400,
      time = '300+0',
      status = 'in_progress',
      options,
    } = (req.body || {});

    const game = await chessService.createChessGame({
      state: String(fen),
      time_format: String(time),
      source: GameSource.STATIC,
      game_status: (String(status) as any) || GameStatus.IN_PROGRESS,
      player_white: { name: String(white), elo: Number(whiteElo) },
      player_black: { name: String(black), elo: Number(blackElo) },
      time_white: 300,
      time_black: 300,
      move_hist: [],
      pool_wagers: { move: { options: Array.isArray(options) ? options.map(String) : [], wagers: [] } } as any,
    } as any);

    if (!game) return res.status(500).json({ ok: false, error: 'Failed to create game' });
    return res.status(200).json({ ok: true, game_id: String(game._id) });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e?.message || 'error' });
  }
};

// --- Dev simulator state (in-memory, dev/test only) ---
type SimulatorState = {
  timer: NodeJS.Timeout,
  nextIndex: number,
  moves: string[],
  interval: number,
  finalResult?: GameStatus,
};

const simulators: Record<string, SimulatorState> = {};

// Lightweight, deterministic odds estimator for dev: material-based heuristic
function estimateWdlFromFen(fen: string): { white_win: number; draw: number; black_win: number } {
  try {
    const [board] = fen.split(' ');
    if (!board) return { white_win: 0.33, draw: 0.34, black_win: 0.33 };
    const val: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
    let white = 0; let black = 0;
    for (const ch of board) {
      if (ch === '/' || /[1-8]/.test(ch)) continue;
      const lower = ch.toLowerCase();
      const v = val[lower] ?? 0;
      if (ch === lower) black += v; else white += v;
    }
    const diff = white - black;
    const norm = Math.tanh(diff / 8);
    const draw = 0.12;
    const whiteNoDraw = (norm + 1) / 2;
    const white_win = Math.max(0, Math.min(1, whiteNoDraw * (1 - draw)));
    const black_win = Math.max(0, Math.min(1, (1 - whiteNoDraw) * (1 - draw)));
    const sum = white_win + draw + black_win;
    return { white_win: white_win / sum, draw: draw / sum, black_win: black_win / sum };
  } catch {
    return { white_win: 0.33, draw: 0.34, black_win: 0.33 };
  }
}

function topMovesFromPosition(chess: any): string[] {
  try {
    const sanList = chess.moves(); // SAN strings
    return sanList.slice(0, 3);
  } catch {
    return [];
  }
}

// Internal helper to advance a game by one SAN move
async function advanceMoveInternal(gameId: string, san: string, whiteTime?: number, blackTime?: number) {
  const game = await chessService.getChessGame(gameId);
  if (!game) throw new Error('Game not found');
  if (game.complete) throw new Error('Game already complete');

  // Initialize chess from current FEN
  const chess = new ChessGame(game.state);
  const move = chess.move(san);
  if (!move) throw new Error(`Illegal SAN: ${san}`);

  // Compute times and move metadata
  const moverIsWhite = move.color === 'w';
  const nextWhite = typeof whiteTime === 'number' ? whiteTime : game.time_white;
  const nextBlack = typeof blackTime === 'number' ? blackTime : game.time_black;
  const moveTime = moverIsWhite ? nextWhite : nextBlack;

  const newHist: MoveData[] = [...(game.move_hist || []), {
    san: move.san,
    from: move.from,
    to: move.to,
    time: moveTime,
    is_white: moverIsWhite,
  }];

  // Reset move pool wagers for the new position (options can be populated separately if desired)
  const updateFields: any = {
    state: chess.fen(),
    move_hist: newHist as any,
    time_white: nextWhite,
    time_black: nextBlack,
    game_status: GameStatus.IN_PROGRESS,
    pool_wagers: { move: { options: [], wagers: [] } },
  };

  const updated = await chessService.updateChessGame(gameId, updateFields);

  // Broadcast move to websocket room so connected clients update immediately
  try {
    const ns = getChessNamespace();
    if (ns) {
      ns.to(gameId).emit('new_move', { gameId, ...updateFields });
    }
  } catch (e) {
    // ignore broadcast errors in dev
  }

  // Emit lightweight odds + move options for the new position (dev-only, engine-free)
  try {
    const odds = estimateWdlFromFen(chess.fen());
    const options = topMovesFromPosition(chess);
    const oddsUpdate: any = {
      odds,
      pool_wagers: { move: { options, wagers: [] } },
    };
    await chessService.updateChessGame(gameId, oddsUpdate);
    const ns = getChessNamespace();
    if (ns) ns.to(gameId).emit('new_odds', { gameId, ...oddsUpdate });
  } catch {}

  // Resolve move wagers for the move just played using previous move options for logging/debug
  const prevOptions = (game.pool_wagers?.move?.options || []).map(String);
  const moveWagers = await resolveCriticalMoveWagers(gameId, chess.history(), prevOptions);
  // Emit wager results to affected users (mirror live stream behavior)
  try {
    const ns = getChessNamespace();
    if (ns && moveWagers && typeof moveWagers === 'object') {
      Object.entries(moveWagers as any).forEach(([uid, wagers]) => {
        ns.to(String(uid)).emit('wager_result', { gameId, wagers });
      });
    }
  } catch {}

  // If the game has ended after this move, finalize result and resolve WDL as well
  let wdlWagers: any = undefined;
  const status = getChessStatus(chess as any);
  if (status !== GameStatus.IN_PROGRESS) {
    await chessService.updateChessGame(gameId, { game_status: status, complete: true });
    try {
      const ns = getChessNamespace();
      if (ns) ns.to(gameId).emit('game_over', { gameId, game_status: status, complete: true });
    } catch {}
    wdlWagers = await resolveWdlWagers(gameId, status);
  }

  return { updatedGame: updated, moveWagers, wdlWagers };
}

// POST /admin/dev/advance-move
export const advanceMoveDev: RequestHandler = async (req, res) => {
  try {
    if (process.env.NODE_ENV === 'production') {
      return res.status(403).json({ error: 'Forbidden' });
    }
    // Gate behind DEV_SIMULATOR (default enabled unless explicitly set to 'false')
    if (String(process.env.DEV_SIMULATOR || 'true').toLowerCase() === 'false') {
      return res.status(403).json({ error: 'Simulator disabled' });
    }
    const { game_id, san, white_time, black_time } = (req.body || {});
    if (!game_id || !san) {
      return res.status(400).json({ ok: false, error: 'Missing game_id or san' });
    }

    const { updatedGame, moveWagers, wdlWagers } = await advanceMoveInternal(String(game_id), String(san),
      typeof white_time === 'number' ? white_time : undefined,
      typeof black_time === 'number' ? black_time : undefined,
    );

    return res.status(200).json({ ok: true, resolved: { moveWagers, wdlWagers }, game: updatedGame });
  } catch (e: any) {
    logger.log({ level: 'error', event: 'dev_advance_move_error', context: { error: e?.message || String(e) } });
    return res.status(400).json({ ok: false, error: e?.message || 'error' });
  }
};

// POST /admin/dev/simulate-game
export const simulateGameDev: RequestHandler = async (req, res) => {
  try {
    if (process.env.NODE_ENV === 'production') {
      return res.status(403).json({ error: 'Forbidden' });
    }
    if (String(process.env.DEV_SIMULATOR || 'true').toLowerCase() === 'false') {
      return res.status(403).json({ error: 'Simulator disabled' });
    }
    const { game_id, san_moves, interval_ms, final_result, sequence, speed } = (req.body || {});
    const gameId = String(game_id || '');
    if (!gameId || !Array.isArray(san_moves) || san_moves.length === 0) {
      // Allow using a built-in sequence name if san_moves not provided
      const builtIn: Record<string, string[]> = {
        scholars_mate: ['e4','e5','Qh5','Nc6','Bc4','Nf6','Qxf7#'],
        four_knights: ['e4','e5','Nf3','Nc6','Nc3','Nf6'],
        mini_endgame: ['e4','e5','Ke2','Ke7','Ke3','Ke6'],
      };
      const key = String(sequence || '').toLowerCase();
      const fallback = builtIn[key] || builtIn['four_knights'];
      if (!fallback) return res.status(400).json({ ok: false, error: 'Missing game_id or san_moves' });
      (req as any).body.san_moves = fallback;
    }
    if (simulators[gameId]) {
      return res.status(400).json({ ok: false, error: 'Simulation already running for this game' });
    }

    const speedMap: Record<string, number> = { slow: 600, medium: 350, fast: 150 };
    const interval = Math.max(50, Number(interval_ms || speedMap[String(speed || '').toLowerCase()] || 250));
    const finalResult: GameStatus | undefined = final_result as GameStatus | undefined;

    const state: SimulatorState = {
      timer: setInterval(() => {}, interval) as unknown as NodeJS.Timeout,
      nextIndex: 0,
      moves: ((req.body.san_moves || san_moves) as string[]).map(String),
      interval,
      finalResult,
    };

    // Ensure game is marked in progress and emit start signal
    try {
      await chessService.updateChessGame(gameId, { game_status: GameStatus.IN_PROGRESS, complete: false });
      const ns = getChessNamespace();
      if (ns) ns.to(gameId).emit('start_game', { gameId, game_status: GameStatus.IN_PROGRESS });
    } catch {}

    const tick = async () => {
      // stop if finished
      if (state.nextIndex >= state.moves.length) {
        clearInterval(state.timer);
        delete simulators[gameId];
        // finalize WDL if provided
        if (finalResult) {
          try {
            await chessService.updateChessGame(gameId, { game_status: finalResult, complete: true });
            try {
              const ns = getChessNamespace();
              if (ns) ns.to(gameId).emit('game_over', { gameId, game_status: finalResult, complete: true });
            } catch {}
            await resolveWdlWagers(gameId, finalResult);
          } catch (err: any) {
            logger.log({ level: 'error', event: 'dev_sim_finalize_error', context: { gameId, error: err?.message || String(err) } });
          }
        }
        return;
      }

      const san = state.moves[state.nextIndex];
      state.nextIndex += 1;
      try {
        await advanceMoveInternal(gameId, san);
      } catch (err: any) {
        logger.log({ level: 'error', event: 'dev_sim_tick_error', context: { gameId, san, error: err?.message || String(err) } });
      }
    };

    // Create the actual timer and store it
    const timer = setInterval(() => { tick(); }, interval);
    state.timer = timer;
    simulators[gameId] = state;

    // Fire first move immediately for responsiveness
    tick();

    return res.status(200).json({ ok: true, started: true });
  } catch (e: any) {
    logger.log({ level: 'error', event: 'dev_simulate_game_error', context: { error: e?.message || String(e) } });
    return res.status(400).json({ ok: false, error: e?.message || 'error' });
  }
};

// POST /admin/dev/stop-simulate
export const stopSimulateDev: RequestHandler = async (req, res) => {
  try {
    if (process.env.NODE_ENV === 'production') {
      return res.status(403).json({ error: 'Forbidden' });
    }
    if (String(process.env.DEV_SIMULATOR || 'true').toLowerCase() === 'false') {
      return res.status(403).json({ error: 'Simulator disabled' });
    }
    const { game_id } = (req.body || {});
    const gameId = String(game_id || '');
    const sim = simulators[gameId];
    if (!sim) return res.status(404).json({ ok: false, error: 'No simulation found for this game' });
    clearInterval(sim.timer);
    delete simulators[gameId];
    return res.status(200).json({ ok: true, stopped: true });
  } catch (e: any) {
    return res.status(400).json({ ok: false, error: e?.message || 'error' });
  }
};
