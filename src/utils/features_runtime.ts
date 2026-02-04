import Config from '../models/config_model';

export type FeatureFlags = {
  realModeEnabled: boolean;
  enableFaucet: boolean;
  enableRateLimiting: boolean;
  pricingModelVersion: string;
  enableWithdrawals?: boolean;
  requireKyc?: boolean;
  requireEmailVerification?: boolean;
  enableEmailDeposits?: boolean;
  enableEmailWithdrawals?: boolean;
  enableEmailInvites?: boolean;
  // Ops toggles
  pauseGameIntake?: boolean;
  pauseMessage?: string;
  // Withdrawal policy (overrides env when set)
  withdrawMinUsd?: number;
  withdrawMaxUsd?: number;
  withdrawMaxDailyUsd?: number;
  withdrawMaxOpen?: number;
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
    enableEmailDeposits: process.env.ENABLE_EMAIL_DEPOSITS === 'true',
    enableEmailWithdrawals: process.env.ENABLE_EMAIL_WITHDRAWALS === 'true',
    enableEmailInvites: process.env.ENABLE_EMAIL_INVITES === 'true',
    pauseGameIntake: false,
    pauseMessage: undefined,
    // Withdrawal limits (env fallbacks)
    withdrawMinUsd: Number(process.env.WITHDRAW_MIN_USD || 10),
    withdrawMaxUsd: Number(process.env.WITHDRAW_MAX_USD || 5000),
    withdrawMaxDailyUsd: Number(process.env.WITHDRAW_MAX_DAILY_USD || 500),
    withdrawMaxOpen: Number(process.env.WITHDRAW_MAX_OPEN || 1),
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
      enableWithdrawals: toBool((data as any).enableWithdrawals, d.enableWithdrawals || false),
      requireKyc: toBool((data as any).requireKyc, d.requireKyc || false),
      requireEmailVerification: toBool((data as any).requireEmailVerification, d.requireEmailVerification || false),
      enableEmailDeposits: toBool((data as any).enableEmailDeposits, d.enableEmailDeposits || false),
      enableEmailWithdrawals: toBool((data as any).enableEmailWithdrawals, d.enableEmailWithdrawals || false),
      enableEmailInvites: toBool((data as any).enableEmailInvites, d.enableEmailInvites || false),
      pauseGameIntake: toBool((data as any).pauseGameIntake, d.pauseGameIntake || false),
      pauseMessage: String((data as any).pauseMessage ?? (d.pauseMessage || '')),
      withdrawMinUsd: Number((data as any).withdrawMinUsd ?? d.withdrawMinUsd),
      withdrawMaxUsd: Number((data as any).withdrawMaxUsd ?? d.withdrawMaxUsd),
      withdrawMaxDailyUsd: Number((data as any).withdrawMaxDailyUsd ?? d.withdrawMaxDailyUsd),
      withdrawMaxOpen: Number((data as any).withdrawMaxOpen ?? d.withdrawMaxOpen),
    };
  } catch {
    return defaults();
  }
}
