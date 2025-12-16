import Config from '../models/config_model';

export type FeatureFlags = {
  realModeEnabled: boolean;
  enableFaucet: boolean;
  enableRateLimiting: boolean;
  pricingModelVersion: string;
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
  };
}

export async function getFeatures(): Promise<FeatureFlags> {
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
    };
  } catch {
    return defaults();
  }
}

