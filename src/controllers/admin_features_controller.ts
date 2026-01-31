import { RequestHandler } from 'express';
import Config from '../models/config_model';

type FeatureFlags = {
  realModeEnabled: boolean;
  enableFaucet: boolean;
  enableRateLimiting: boolean;
  pricingModelVersion: string;
  enableWithdrawals?: boolean;
  requireKyc?: boolean;
  requireEmailVerification?: boolean;
};

const toBool = (v: any, d: boolean): boolean => {
  if (v === true || v === false) return v;
  if (typeof v === 'string') {
    const s = v.toLowerCase();
    if (s === 'true') return true;
    if (s === 'false') return false;
  }
  return d;
};

function defaults(): FeatureFlags {
  const isDev = process.env.NODE_ENV === 'development';
  return {
    realModeEnabled: (process.env.FEATURE_REAL_MODE === 'true') || isDev,
    enableFaucet: process.env.ENABLE_FAUCET === 'true',
    enableRateLimiting: (process.env.NODE_ENV === 'production') || (process.env.ENABLE_RATE_LIMITING === 'true'),
    pricingModelVersion: process.env.PRICING_MODEL_VERSION || 'v0',
    enableWithdrawals: process.env.ENABLE_WITHDRAWALS === 'true',
    requireKyc: process.env.REQUIRE_KYC === 'true',
    requireEmailVerification: process.env.REQUIRE_EMAIL_VERIFICATION === 'true',
  };
}

async function readFeatures(): Promise<FeatureFlags> {
  try {
    const doc = await Config.findOne({ key: 'features' }).lean();
    if (!doc || !doc.data) return defaults();
    const d = defaults();
    const data = doc.data as Partial<FeatureFlags>;
    return {
      realModeEnabled: toBool(data.realModeEnabled, d.realModeEnabled),
      enableFaucet: toBool(data.enableFaucet, d.enableFaucet),
      enableRateLimiting: toBool(data.enableRateLimiting, d.enableRateLimiting),
      pricingModelVersion: String(data.pricingModelVersion ?? d.pricingModelVersion),
      enableWithdrawals: toBool((data as any).enableWithdrawals, d.enableWithdrawals || false),
      requireKyc: toBool((data as any).requireKyc, d.requireKyc || false),
      requireEmailVerification: toBool((data as any).requireEmailVerification, d.requireEmailVerification || false),
    };
  } catch (_e) {
    return defaults();
  }
}

export const getFeatures: RequestHandler = async (_req, res) => {
  const flags = await readFeatures();
  res.status(200).json(flags);
};

export const updateFeatures: RequestHandler = async (req, res) => {
  try {
    const patch = (req.body || {}) as Partial<FeatureFlags>;
    const existing = await Config.findOne({ key: 'features' });
    const merged = { ...(existing?.data || {}), ...patch } as FeatureFlags;
    const updated = await Config.findOneAndUpdate(
      { key: 'features' },
      { $set: { data: merged } },
      { upsert: true, new: true }
    ).lean();

    // Return the normalized flags (merged with defaults for missing fields)
    const normalized = await readFeatures();
    res.status(200).json(normalized);
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Failed to update features' });
  }
};

export default { getFeatures, updateFeatures };
