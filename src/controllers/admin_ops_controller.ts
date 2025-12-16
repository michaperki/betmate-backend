import { RequestHandler } from 'express';
import mongoose from 'mongoose';
import axios from 'axios';
import opsMetrics from '../utils/ops_metrics';

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

export default { getOpsStats, pingMicroservice };
