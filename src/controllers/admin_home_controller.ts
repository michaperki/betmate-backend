import { RequestHandler } from 'express';
import mongoose from 'mongoose';
import { getGlobalExposure } from '../services/exposure_service';
import { getRiskConfig } from '../helpers/risk_config';
import { getFeatures as getRuntimeFeatures } from '../utils/features_runtime';
import Deposit from '../models/deposit_model';
import { getVersionInfo } from '../helpers/version';

export const getAdminHome: RequestHandler = async (_req, res) => {
  try {
    const now = Date.now();
    const since = new Date(now - 24 * 60 * 60 * 1000);

    // Parallel fetches for speed
    const [features, exposure, risk, counts, version] = await Promise.all([
      getRuntimeFeatures(),
      getGlobalExposure().catch(() => ({ total: 0, byGame: [] })),
      Promise.resolve(getRiskConfig()).catch(() => null),
      (async () => {
        const [pending, confirmed24h, failed24h] = await Promise.all([
          Deposit.countDocuments({ status: 'pending' }),
          Deposit.countDocuments({ status: 'confirmed', created_at: { $gte: since } }),
          Deposit.countDocuments({ status: 'failed', created_at: { $gte: since } }),
        ]);
        return { pending, confirmed24h, failed24h };
      })(),
      Promise.resolve(getVersionInfo()),
    ]);

    // Health summary (keep minimal)
    const dbOk = mongoose.connection?.readyState === 1 || mongoose.connection?.readyState === 2;
    const microserviceUrl = process.env.MICROSERVICE_URL || '';

    const env = {
      nodeEnv: process.env.NODE_ENV || 'development',
      version: version.appVersion,
      commit: version.commit,
      release: version.release,
      uptimeMs: (Date.now() - ((global as any).serverStartTime || Date.now())),
      provider: process.env.PAYMENTS_PROVIDER || 'unset',
    };

    const riskSnap = risk ? {
      bankroll: risk.bankroll,
      globalExposure: exposure.total,
      safeMaxStake: risk.perBetLiabilityCap,
    } : { bankroll: 0, globalExposure: 0, safeMaxStake: 0 };

    const health = {
      db: dbOk ? 'ok' : 'down',
      microserviceUrl,
      rateLimitRecent: 0,
    };

    res.status(200).json({ env, features, risk: riskSnap, payments: counts, health });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Failed to load admin home' });
  }
};

export default { getAdminHome };

