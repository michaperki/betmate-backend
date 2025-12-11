import { RequestHandler } from 'express';
import { marketService, chessService } from '../services';
import { handleFailure } from './utils';

// GET /real/markets/:gameId -> { prices, q, b, rake, status, myPosition }
export const getWdlMarket: RequestHandler = async (req, res) => {
  try {
    const { gameId } = req.params as { gameId: string };

    // Gate Real mode via feature flag as an extra safeguard
    const realAllowed = (process.env.FEATURE_REAL_MODE === 'true') || (process.env.NODE_ENV === 'development');
    if (!realAllowed) return res.status(403).json({ error: 'Real mode is currently disabled' });

    // Ensure game exists (also allows us to reflect lock state later)
    const game = await chessService.getChessGame(gameId);
    if (!game) return res.status(404).json({ error: 'Game not found' });

    const market = await marketService.getOrCreateWdlMarket(gameId);
    const prices = marketService.getPrices(market);

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
    });
  } catch (error) {
    if (!res.headersSent) return handleFailure(res)(error);
  }
};

const realMarketController = {
  getWdlMarket,
};

export default realMarketController;

