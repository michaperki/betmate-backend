import { RequestHandler } from 'express';
import { marketService, chessService } from '../services';
import { getRiskConfig, oddsFromP, scaleCapsForConfidence } from '../helpers/risk_config';
import { handleFailure } from './utils';

// GET /real/markets/:gameId -> { prices, q, b, rake, status, myPosition }
export const getWdlMarket: RequestHandler = async (req, res) => {
  try {
    const { gameId } = req.params as { gameId: string };

    // Gate Real mode via DB-backed feature flag (fallback to env for safety)
    let realAllowed = false;
    try {
      const { getFeatures } = require('../utils/features_runtime');
      const f = await getFeatures();
      realAllowed = !!f.realModeEnabled;
    } catch (_e) {
      realAllowed = (process.env.FEATURE_REAL_MODE === 'true') || (process.env.NODE_ENV === 'development');
    }
    if (!realAllowed) return res.status(403).json({ error: 'Real mode is currently disabled' });

    // Ensure game exists (also allows us to reflect lock state later)
    const game = await chessService.getChessGame(gameId);
    if (!game) return res.status(404).json({ error: 'Game not found' });

    const market = await marketService.getOrCreateWdlMarket(gameId);
    const prices = marketService.getPrices(market);

    // Compute house odds and per-bet safe stake caps for Real WDL
    const moveNum = Array.isArray(game.move_hist) ? game.move_hist.length : 0;
    const pWhite = Number((game as any)?.odds?.white_win || 0);
    const pDraw = Number((game as any)?.odds?.draw || 0);
    const pBlack = Number((game as any)?.odds?.black_win || 0);
    const odds = {
      white: oddsFromP(pWhite, 'white_win', moveNum),
      draw: oddsFromP(pDraw, 'draw', moveNum),
      black: oddsFromP(pBlack, 'black_win', moveNum),
    };
    const cfg = getRiskConfig();
    const caps = scaleCapsForConfidence(cfg, moveNum);
    const perBet = caps.perBetLiabilityCap;
    const maxStake = (o: number) => (o > 1 ? Math.max(0, Math.floor(perBet / (o - 1))) : Math.floor(perBet));
    const limits = {
      per_bet: {
        white: maxStake(odds.white),
        draw: maxStake(odds.draw),
        black: maxStake(odds.black),
      }
    };

    // Phase 1: no trades yet, so positions are zero
    const myPosition = { white: 0, draw: 0, black: 0 };

    return res.status(200).json({
      gameId,
      type: 'wdl',
      status: market.status,
      prices,
      q: market.q,
      b: market.b,
      rake: market.rake,
      myPosition,
      limits,
    });
  } catch (error) {
    if (!res.headersSent) return handleFailure(res)(error);
  }
};

const realMarketController = {
  getWdlMarket,
};

export default realMarketController;
