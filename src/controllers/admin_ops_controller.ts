import { RequestHandler } from 'express';
import mongoose from 'mongoose';
import axios from 'axios';
import opsMetrics from '../utils/ops_metrics';
import { getVersionInfo } from '../helpers/version';

export const getOpsStats: RequestHandler = async (_req, res) => {
  try {
    const dbOk = mongoose.connection?.readyState === 1 || mongoose.connection?.readyState === 2;
    const counters = opsMetrics.get();
    res.status(200).json({ db: dbOk ? 'ok' : 'down', rateLimitCounters: counters });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Failed to get ops stats' });
  }
};

export const pingMicroservice: RequestHandler = async (_req, res) => {
  const base = process.env.MICROSERVICE_URL || '';
  if (!base) return res.status(200).json({ ok: false, ms: 0, url: base });
  const url = base.replace(/\/$/, '/');
  const start = Date.now();
  try {
    // Treat any HTTP response (even 404) as reachable; only network error is a failure
    const headers: Record<string, string> = {};
    if (process.env.MICROSERVICE_API_KEY) headers['x-api-key'] = String(process.env.MICROSERVICE_API_KEY);
    const resp = await axios.get(url, {
      timeout: 3000,
      headers,
      validateStatus: () => true, // don't throw on non-2xx
    });
    const ms = Date.now() - start;
    return res.status(200).json({ ok: true, ms, url, status: resp.status });
  } catch (_e) {
    const ms = Date.now() - start;
    return res.status(200).json({ ok: false, ms, url, status: 0 });
  }
};

export const latencySample: RequestHandler = async (_req, res) => {
  const sample: any = { ts: Date.now() };
  // DB ping
  try {
    const start = Date.now();
    // Use admin ping command if available
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (mongoose.connection as any).db.admin().ping();
    sample.db = { ok: true, ms: Date.now() - start };
  } catch (_e) {
    sample.db = { ok: false, ms: null };
  }
  // Microservice ping (reuse existing logic but without headers validation complexity here)
  try {
    const base = process.env.MICROSERVICE_URL || '';
    if (base) {
      const started = Date.now();
      const resp = await axios.get(base.replace(/\/$/, '/'), { timeout: 3000, validateStatus: () => true });
      sample.microservice = { ok: true, status: resp.status, ms: Date.now() - started };
    } else {
      sample.microservice = { ok: false, status: 0, ms: null };
    }
  } catch (_e) {
    sample.microservice = { ok: false, status: 0, ms: null };
  }
  // Email provider (no latency probe; return provider name if configured)
  try {
    const { getMailProviderInfo } = require('../services/email_service');
    const info = getMailProviderInfo();
    sample.email = { provider: info?.provider || 'unset' };
  } catch { sample.email = { provider: 'unset' }; }
  return res.status(200).json(sample);
};

export const runtimeSnapshot: RequestHandler = async (_req, res) => {
  try {
    const version = await getVersionInfo();
    let email = { provider: 'unset' } as any;
    try {
      const { getMailProviderInfo } = require('../services/email_service');
      email = getMailProviderInfo();
    } catch {}
    const features = await (async () => {
      try {
        const { getFeatures } = require('../utils/features_runtime');
        return await getFeatures();
      } catch { return {}; }
    })();
    return res.status(200).json({
      env: {
        nodeEnv: process.env.NODE_ENV || 'development',
        paymentsProvider: process.env.PAYMENTS_PROVIDER || 'unset',
        microserviceUrl: process.env.MICROSERVICE_URL || '',
      },
      version,
      email,
      features,
    });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || 'Failed to load runtime snapshot' });
  }
};

export default { getOpsStats, pingMicroservice, latencySample, runtimeSnapshot };
