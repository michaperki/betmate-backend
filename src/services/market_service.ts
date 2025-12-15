import { FilterQuery, UpdateQuery } from 'mongoose';
import { Market } from 'models';
import { MarketDoc } from '../types/models/market';
import { Chess } from 'models';
import logger from '../helpers/axiom_logger';
import { lmsrPrices, normalizeP, probsToQ } from '../helpers/lmsr';

const REAL_B_DEFAULT = Number(process.env.REAL_MARKET_LMSR_B || 500);
const REAL_RAKE_DEFAULT = Number(process.env.REAL_MARKET_RAKE || 0.02);

const getMarket = (fields: FilterQuery<MarketDoc>) => (
  Market.findOne(fields).then((d) => d as unknown as MarketDoc | null)
);

const createMarket = async (gameId: string): Promise<MarketDoc> => {
  // Seed from chess game WDL odds if available; else use uniform
  const game = await Chess.findById(gameId).lean();
  const p = normalizeP({
    white: Number(game?.odds?.white_win || 0),
    draw: Number(game?.odds?.draw || 0),
    black: Number(game?.odds?.black_win || 0),
  });
  const b = REAL_B_DEFAULT;
  const rake = REAL_RAKE_DEFAULT;
  const q = probsToQ(p, b);

  // Mongoose will cast string -> ObjectId for ObjectId fields; avoid TS ctor issues on Types.ObjectId
  const doc = await new Market({ game_id: gameId as any, type: 'wdl', q, b, rake, status: 'open' }).save();
  return doc as unknown as MarketDoc;
};

const getOrCreateWdlMarket = async (gameId: string): Promise<MarketDoc> => {
  const existing = await getMarket({ game_id: gameId as any, type: 'wdl' } as any);
  if (existing) return existing;
  try {
    return await createMarket(gameId);
  } catch (e: any) {
    // Handle race where two requests try to create at once
    logger.log({ level: 'warn', event: 'market_create_race', context: { gameId, error: e?.message || String(e) } });
    const after = await getMarket({ game_id: gameId as any, type: 'wdl' } as any);
    if (after) return after;
    throw e;
  }
};

const updateMarket = (fields: FilterQuery<MarketDoc>, update: UpdateQuery<MarketDoc>) => (
  Market.findOneAndUpdate(fields, update, { new: true }) as any as Promise<MarketDoc | null>
);

const getPrices = (mkt: MarketDoc) => lmsrPrices(mkt.q as any, mkt.b);

const marketService = {
  getMarket,
  getOrCreateWdlMarket,
  updateMarket,
  getPrices,
};

export default marketService;
