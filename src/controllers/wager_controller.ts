/* eslint-disable @typescript-eslint/naming-convention */
import { RequestHandler } from 'express';
import { Types } from 'mongoose';

import { RequestWithJWT, ValidatedRequestWithJWT } from '../types/requests';
import { chessService, userService, wagerService, microserviceService } from '../services';
import { getRiskConfig, oddsFromP, scaleCapsForConfidence, getFeatureFlags } from '../helpers/risk_config';
import logger from '../helpers/logger';
import { getGameExposure, getGlobalExposure, getPlayerGameLiability } from '../services/exposure_service';
import { CreateWagerRequest, GetWagersRequest } from '../validation/wager';
import { handleFailure, handleSuccess } from './utils';
import { WagerStatus } from '../types/models/wager';

type WagerRequestBody = {
  wdl: boolean,
  amount: number,
  data: string,
  odds: number,
  move_number: number,
  mode?: 'arcade' | 'real',
  currency?: 'BET' | 'USDT',
};

/**
 * Create wager from request
 *
 * Request must be prefixed with appropriate validation middleware
 * - `requireAuth`
 * - `validator.body(CreateWagerSchema)`
 * - `validateRequest`
 *
 * Creating a wager can fail for the following reasons
 * - Game specified not found
 * - Game specified already finished
 * - User does not have enough money in account to create wager
 * - After accounting for input lag (1 second), game state has changed
 */
const createWagerRequest: RequestHandler = async (req: ValidatedRequestWithJWT<CreateWagerRequest>, res) => {
  try {
    const { amount } : WagerRequestBody = req.body;

    const better_id = req.user._id;
    const game_id = req.params.id;

    // check game exists and hasn't ended
    const game = await chessService.getChessGame(game_id);
    if (game.complete) {
      logger.log({ level: 'info', event: 'wager_reject', context: { reason: 'GAME_ENDED', game_id, user_id: String(better_id) } });
      res.status(400).send({ error: 'Game has already ended' });
      return;
    }

    // Determine requested mode and gate Real mode via DB-backed feature flag
    const mode = req.body.mode === 'real' ? 'real' : 'arcade';
    const { getFeatures: getRuntimeFeatures } = require('../utils/features_runtime');
    const featureFlags = await getRuntimeFeatures();
    const realAllowed = !!featureFlags.realModeEnabled;
    if (mode === 'real' && !realAllowed) {
      logger.log({ level: 'info', event: 'wager_reject', context: { reason: 'REAL_DISABLED', game_id, user_id: String(better_id) } });
      res.status(403).json({ error: 'Real mode is currently disabled' });
      return;
    }

    // Enforce currency by mode: Arcade=BET, Real=USDT (ignore client override)
    const currency = mode === 'real' ? 'USDT' : 'BET';
    // Arcade uses token_balance only
    const arcadeBalance = Number((req.user as any).token_balance || 0);
    const effectiveBalance = mode === 'real' ? Number((req.user as any).cash_balance || 0) : arcadeBalance;

    // check user has enough money to place bet
    if (!effectiveBalance || amount > effectiveBalance) {
      logger.log({ level: 'info', event: 'wager_reject', context: { reason: 'INSUFFICIENT', game_id, user_id: String(better_id), amount, balance: effectiveBalance, mode } });
      res.status(401).json({ error: 'Insufficient funds' });
      return;
    }

    // Extract only the fields we need for a user wager (ensure is_bot is false)
    const { wdl, data, odds, move_number } = req.body;

    // Accept Arcade (K-Bits) wagers without stake caps
    // (No-op: previously enforced ARCADE_MAX_STAKE_* caps)

    // If Arcade move bet, compute house-priced odds from engine deltas (Level-0)
    let computedOdds = odds;
    if (!wdl && mode === 'arcade') {
      try {
        const fen = game.state;
        const offered = (game.pool_wagers?.move?.options || []) as string[];
        const top = await microserviceService.getTopMoves(fen, Math.max(12, offered.length || 3));

        const scoreByMove = new Map<string, number>();
        let bestScore = -Infinity;
        for (const item of top || []) {
          const mv = String((item as any)?.move || '');
          const sc = Number((item as any)?.score || 0);
          if (!mv) continue;
          scoreByMove.set(mv, sc);
          if (sc > bestScore) bestScore = sc;
        }
        if (!Number.isFinite(bestScore)) bestScore = 0;

        // Smooth weights via exponential decay on centipawn delta from best
        const K = Math.max(0.001, Number(process.env.ARCADE_DELTA_EXP_K ?? 0.03));
        const rawP = (mv: string): number => {
          const sc = scoreByMove.has(mv) ? (scoreByMove.get(mv) as number) : (bestScore - 250);
          const delta = Math.max(0, bestScore - sc); // worse moves have larger delta
          return Math.exp(-K * delta);
        };

        // Work over the currently offered moves if available; otherwise use top list
        const universe = (offered && offered.length ? offered : (top || []).map((t: any) => String(t.move))).filter(Boolean);
        const baseList = universe.length ? universe : [data];
        const raws = baseList.map(rawP);
        const sum = raws.reduce((a, b) => a + b, 0) || 1;
        const targetRaw = rawP(data);
        const p = Math.max(1e-6, targetRaw / sum);

        const margin = Math.max(0, Math.min(0.25, Number(process.env.ARCADE_MOVE_MARGIN || 0.08)));
        const MAX_ODDS = Math.max(1, Number(process.env.ARCADE_MOVE_MAX_ODDS ?? 25));
        const houseOdds = (1 - margin) / p;
        computedOdds = Math.max(1, Math.min(MAX_ODDS, Number(houseOdds.toFixed(2))));
      } catch (e) {
        // Fall back to client-provided odds if pricing fails
        computedOdds = Math.max(1, Number(odds) || 1);
      }
    }

    // If Real + WDL, compute server-side odds with margin/clamps and enforce exposure caps
    if (wdl && mode === 'real') {
      // Feature flags and quick disables
      const flags = getFeatureFlags();
      if (!flags.enabled) {
        logger.log({ level: 'info', event: 'wager_reject', context: { reason: 'REAL_WDL_DISABLED', game_id, user_id: String(better_id) } });
        res.status(403).json({ error: 'Real WDL (house) is disabled' });
        return;
      }
      if (flags.disableWdl) {
        logger.log({ level: 'info', event: 'wager_reject', context: { reason: 'WDL_DISABLED', game_id, user_id: String(better_id) } });
        res.status(403).json({ error: 'WDL betting is temporarily disabled' });
        return;
      }
      if (flags.disableDraw && data === 'draw') {
        logger.log({ level: 'info', event: 'wager_reject', context: { reason: 'DRAW_DISABLED', game_id, user_id: String(better_id) } });
        res.status(403).json({ error: 'Draw betting is temporarily disabled' });
        return;
      }

      // Compute house odds from engine probabilities + margin
      const moveNum = game.move_hist.length;
      const pMap: Record<string, number> = {
        white_win: Number((game as any)?.odds?.white_win || 0),
        draw: Number((game as any)?.odds?.draw || 0),
        black_win: Number((game as any)?.odds?.black_win || 0),
      };
      const p = pMap[data] ?? 0;
      if (!(p > 0)) {
        logger.log({ level: 'info', event: 'wager_reject', context: { reason: 'PRICING_UNAVAILABLE', game_id, user_id: String(better_id), outcome: data } });
        res.status(400).json({ error: 'Pricing unavailable for this outcome' });
        return;
      }

      const serverOdds = oddsFromP(p, data as any, moveNum);
      const betLiability = amount * (serverOdds - 1);

      // Compute current exposures
      const [gameExp, globalExp, playerLiab] = await Promise.all([
        getGameExposure(game_id),
        getGlobalExposure(),
        getPlayerGameLiability(game_id, String(better_id)),
      ]);

      // Derive caps (scaled for early/low-confidence)
      const baseCaps = getRiskConfig();
      const caps = scaleCapsForConfidence(baseCaps, moveNum);

      // Projected exposures if we accept this bet
      const outcomeKey = data as 'white_win' | 'draw' | 'black_win';
      const outcomeProjected = gameExp.perOutcome[outcomeKey] + betLiability;
      const gameWorstProjected = Math.max(
        outcomeProjected,
        outcomeKey === 'white_win' ? gameExp.perOutcome.draw : gameExp.perOutcome.white_win,
        outcomeKey === 'black_win' ? gameExp.perOutcome.draw : gameExp.perOutcome.black_win,
      );
      const deltaWorst = Math.max(0, gameWorstProjected - gameExp.worstCase);
      const globalProjected = globalExp.total + deltaWorst;
      const playerProjected = playerLiab + betLiability;

      // Enforce caps
      if (betLiability > caps.perBetLiabilityCap) {
        logger.log({ level: 'info', event: 'wager_reject', context: { reason: 'CAP_PER_BET', cap: caps.perBetLiabilityCap, projected: betLiability, game_id, user_id: String(better_id) } });
        res.status(403).json({ error: 'Per-bet limit exceeded', code: 'CAP_PER_BET', cap: caps.perBetLiabilityCap, projected: betLiability });
        return;
      }
      if (playerProjected > caps.perPlayerPerGameCap) {
        logger.log({ level: 'info', event: 'wager_reject', context: { reason: 'CAP_PER_PLAYER_GAME', cap: caps.perPlayerPerGameCap, projected: playerProjected, game_id, user_id: String(better_id) } });
        res.status(403).json({ error: 'Per-player limit exceeded', code: 'CAP_PER_PLAYER_GAME', cap: caps.perPlayerPerGameCap, projected: playerProjected });
        return;
      }
      if (outcomeProjected > caps.perOutcomeCap[outcomeKey]) {
        logger.log({ level: 'info', event: 'wager_reject', context: { reason: 'CAP_PER_OUTCOME', outcome: outcomeKey, cap: caps.perOutcomeCap[outcomeKey], projected: outcomeProjected, game_id, user_id: String(better_id) } });
        res.status(403).json({ error: 'Outcome exposure limit reached', code: 'CAP_PER_OUTCOME', outcome: outcomeKey, cap: caps.perOutcomeCap[outcomeKey], projected: outcomeProjected });
        return;
      }
      if (gameWorstProjected > caps.perGameWorstCaseCap) {
        logger.log({ level: 'info', event: 'wager_reject', context: { reason: 'CAP_PER_GAME', cap: caps.perGameWorstCaseCap, projected: gameWorstProjected, game_id, user_id: String(better_id) } });
        res.status(403).json({ error: 'Game exposure limit reached', code: 'CAP_PER_GAME', cap: caps.perGameWorstCaseCap, projected: gameWorstProjected });
        return;
      }
      if (globalProjected > caps.globalExposureCap) {
        logger.log({ level: 'info', event: 'wager_reject', context: { reason: 'CAP_GLOBAL', cap: caps.globalExposureCap, projected: globalProjected, game_id, user_id: String(better_id) } });
        res.status(403).json({ error: 'Global exposure limit reached', code: 'CAP_GLOBAL', cap: caps.globalExposureCap, projected: globalProjected });
        return;
      }

      computedOdds = serverOdds;
    }

    const pv = featureFlags.pricingModelVersion || (process.env.PRICING_MODEL_VERSION || 'wdl-house-v1');
    const doc = await wagerService.createWager({
      game_id,
      better_id,
      wdl,
      data,
      amount,
      odds: computedOdds,
      move_number,
      is_bot: false,
      mode,
      currency,
      pricing_model_version: pv,
    });

    // Update user balance
    // Debit the appropriate wallet and leave others untouched.
    if (mode === 'real') {
      await userService.updateUserData(req.user._id, { $inc: { cash_balance: -amount } });
    } else {
      await userService.updateUserData(req.user._id, { $inc: { token_balance: -amount } });
    }

    // Record balance history
    await userService.recordBalanceChange(
      req.user._id,
      -amount,
      'Wager placed',
      doc._id,
      'Wager',
      currency
    );

    res.status(200).json(doc);
    try {
      if (mode === 'arcade') {
        logger.log({ level: 'info', event: 'arcade_wager_placed', context: { game_id, user_id: String(better_id), wdl, amount, odds: computedOdds } });
      }
    } catch {}
    return;
  } catch (error) {
    if (!res.headersSent) {
      return handleFailure(res)(error);
    }
  }
};

/**
 * Get wager specified in request
 *
 * ID of requesting user must match `better_id` field of wager
 *
 * Request must be prefixed with appropriate validation middleware
 * - `requireAuth`
 */
const getWagerRequest: RequestHandler = async (req: RequestWithJWT, res) => {
  try {
    const wager = await wagerService.getWager(req.params.id);
    if (String(wager.better_id) !== String(req.user._id)) return res.status(400).send({ error: 'Unauthorized' });
    return res.status(200).send(wager);
  } catch (error) {
    if (!res.headersSent) {
      return handleFailure(res)(error);
    }
  }
};

/**
 * Get all wagers of requesting user
 *
 * Request must be prefixed with appropriate validation middleware
 * - `requireAuth`
 * - `validator.query(GetWagersSchema)`
 * - `validateRequest`
 */
const getUserWagersRequest: RequestHandler = (req: ValidatedRequestWithJWT<GetWagersRequest>, res) => (
  wagerService
    .getWagers({ better_id: req.user._id, ...req.query })
    .then(handleSuccess(res))
    .catch(handleFailure(res))
);


/**
 * Get user's betting statistics (total wagers and win rate)
 *
 * Request must be prefixed with appropriate validation middleware
 * - `requireAuth`
 */
const getUserBettingStats: RequestHandler = async (req: RequestWithJWT, res) => {
  try {
    const stats = await userService.getUserBettingStats(req.user._id);
    return res.status(200).json(stats);
  } catch (error) {
    return handleFailure(res)(error);
  }
};

/**
 * Get user's active wagers (wagers with pending status)
 *
 * Request must be prefixed with appropriate validation middleware
 * - `requireAuth`
 */
const getUserActiveWagers: RequestHandler = async (req: RequestWithJWT, res) => {
  try {
    const activeWagers = await userService.getUserActiveWagers(req.user._id);
    return res.status(200).json(activeWagers);
  } catch (error) {
    return handleFailure(res)(error);
  }
};

/**
 * Get user's wager history with optional filtering and pagination
 *
 * Request must be prefixed with appropriate validation middleware
 * - `requireAuth`
 */
const getUserWagerHistory: RequestHandler = async (req: RequestWithJWT, res) => {
  try {
    const { status, limit, skip } = req.query;

    // Parse status if provided
    let wagerStatus: WagerStatus | undefined;
    if (status) {
      if (Object.values(WagerStatus).includes(status as WagerStatus)) {
        wagerStatus = status as WagerStatus;
      } else {
        return res.status(400).json({ error: 'Invalid status parameter' });
      }
    }

    // Parse pagination parameters
    const parsedLimit = limit ? parseInt(limit as string, 10) : 50;
    const parsedSkip = skip ? parseInt(skip as string, 10) : 0;

    // Get wager history
    const wagerHistory = await userService.getUserWagerHistory(
      req.user._id,
      wagerStatus,
      parsedLimit,
      parsedSkip
    );

    return res.status(200).json(wagerHistory);
  } catch (error) {
    return handleFailure(res)(error);
  }
};

const wagerController = {
  createWagerRequest,
  getWagerRequest,
  getUserWagersRequest,
  getUserBettingStats,
  getUserActiveWagers,
  getUserWagerHistory
};

export default wagerController;
