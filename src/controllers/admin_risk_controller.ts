import { RequestHandler } from 'express';
import { getGlobalExposure as svcGetGlobal, getGameExposure as svcGetGame } from '../services/exposure_service';
import { getRiskConfig, updateOverrides } from '../helpers/risk_config';
import { writeAuditEntry } from '../utils/admin_audit';
import { handleFailure } from './utils';

export const getRiskConfigHandler: RequestHandler = async (_req, res) => {
  try {
    const cfg = getRiskConfig();
    res.status(200).json(cfg);
  } catch (error) {
    if (!res.headersSent) return handleFailure(res)(error);
  }
};

export const updateRiskConfigHandler: RequestHandler = async (req, res) => {
  try {
    const cfg = updateOverrides(req.body || {});
    try { await writeAuditEntry(req as any, 'risk.update', undefined, Object.keys(req.body || {}).join(',')); } catch {}
    res.status(200).json(cfg);
  } catch (error) {
    if (!res.headersSent) return handleFailure(res)(error);
  }
};

export const getGlobalExposureHandler: RequestHandler = async (_req, res) => {
  try {
    const data = await svcGetGlobal();
    const caps = getRiskConfig();
    res.status(200).json({ exposure: data, caps: {
      globalExposureCap: caps.globalExposureCap,
      perGameWorstCaseCap: caps.perGameWorstCaseCap,
      perOutcomeCap: caps.perOutcomeCap,
      perBetLiabilityCap: caps.perBetLiabilityCap,
      perPlayerPerGameCap: caps.perPlayerPerGameCap,
    }});
  } catch (error) {
    if (!res.headersSent) return handleFailure(res)(error);
  }
};

export const getGameExposureHandler: RequestHandler = async (req, res) => {
  try {
    const { gameId } = req.params as { gameId: string };
    const data = await svcGetGame(gameId);
    const caps = getRiskConfig();
    res.status(200).json({ gameId, exposure: data, caps: {
      perGameWorstCaseCap: caps.perGameWorstCaseCap,
      perOutcomeCap: caps.perOutcomeCap,
      perBetLiabilityCap: caps.perBetLiabilityCap,
      perPlayerPerGameCap: caps.perPlayerPerGameCap,
    }});
  } catch (error) {
    if (!res.headersSent) return handleFailure(res)(error);
  }
};

const adminRiskController = {
  getRiskConfig: getRiskConfigHandler,
  updateRiskConfig: updateRiskConfigHandler,
  getGlobalExposure: getGlobalExposureHandler,
  getGameExposure: getGameExposureHandler,
};

export default adminRiskController;

// Presets: lightweight mapping for quick ops defaults
const PRESETS: Record<string, any> = {
  // Extremely conservative caps for closed beta
  beta: {
    enabled: true,
    disableWdl: false,
    disableDraw: false,
    // Bankroll is mostly informational for derived defaults; we override absolute caps below
    bankroll: 2000,
    // Absolute risk caps
    globalExposureCap: 500,
    perGameWorstCaseCap: 200,
    perOutcomeCap: { white_win: 80, black_win: 80, draw: 40 },
    perBetLiabilityCap: 25,
    perPlayerPerGameCap: 50,
    // Pricing/odds margins and limits
    baseMargin: 0.08,
    drawExtraMargin: 0.10,
    maxOdds: { white_win: 5, black_win: 5, draw: 7 },
    // Confidence tuning
    earlyMoveNum: 20,
    capMultiplierEarly: 0.5,
    extraMarginLowConf: 0.03,
    // No tilt by default
    skew: { white_win: 1.0, black_win: 1.0, draw: 1.0 },
  },
  // Conservative
  low: {
    enabled: true,
    disableWdl: false,
    disableDraw: false,
    bankroll: 50000,
    globalExposureCap: 5000,
    perGameWorstCaseCap: 2000,
    perOutcomeCap: { white_win: 800, black_win: 800, draw: 600 },
    perBetLiabilityCap: 200,
    perPlayerPerGameCap: 600,
    baseMargin: 0.06,
    drawExtraMargin: 0.08,
    maxOdds: { white_win: 6, black_win: 6, draw: 8 },
    earlyMoveNum: 20,
    capMultiplierEarly: 0.6,
    extraMarginLowConf: 0.03,
    skew: { white_win: 1.0, black_win: 1.0, draw: 1.0 },
  },
  // Balanced
  med: {
    enabled: true,
    disableWdl: false,
    disableDraw: false,
    bankroll: 100000,
    globalExposureCap: 15000,
    perGameWorstCaseCap: 5000,
    perOutcomeCap: { white_win: 2000, black_win: 2000, draw: 1500 },
    perBetLiabilityCap: 400,
    perPlayerPerGameCap: 1200,
    baseMargin: 0.05,
    drawExtraMargin: 0.07,
    maxOdds: { white_win: 7, black_win: 7, draw: 9 },
    earlyMoveNum: 20,
    capMultiplierEarly: 0.7,
    extraMarginLowConf: 0.03,
    skew: { white_win: 1.0, black_win: 1.0, draw: 1.0 },
  },
  // Aggressive
  high: {
    enabled: true,
    disableWdl: false,
    disableDraw: false,
    bankroll: 200000,
    globalExposureCap: 40000,
    perGameWorstCaseCap: 15000,
    perOutcomeCap: { white_win: 6000, black_win: 6000, draw: 4500 },
    perBetLiabilityCap: 800,
    perPlayerPerGameCap: 2400,
    baseMargin: 0.04,
    drawExtraMargin: 0.06,
    maxOdds: { white_win: 8, black_win: 8, draw: 10 },
    earlyMoveNum: 20,
    capMultiplierEarly: 0.8,
    extraMarginLowConf: 0.03,
    skew: { white_win: 1.0, black_win: 1.0, draw: 1.0 },
  },
};

export const applyRiskPresetHandler: import('express').RequestHandler = async (req, res) => {
  try {
    const lvl = String(req.body?.level || '').toLowerCase();
    if (!['beta', 'low', 'med', 'high'].includes(lvl)) {
      return res.status(400).json({ error: 'Invalid level' });
    }
    const patch = PRESETS[lvl];
    const cfg = updateOverrides(patch);
    try { await writeAuditEntry(req as any, 'risk.preset', undefined, lvl); } catch {}
    return res.status(200).json(cfg);
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || 'Failed to apply preset' });
  }
};
