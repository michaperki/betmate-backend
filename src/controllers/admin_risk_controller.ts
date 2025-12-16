import { RequestHandler } from 'express';
import { getGlobalExposure as svcGetGlobal, getGameExposure as svcGetGame } from '../services/exposure_service';
import { getRiskConfig, updateOverrides } from '../helpers/risk_config';
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
  low: {
    bankroll: 50000,
    baseMargin: 0.06,
    drawExtraMargin: 0.08,
    perBetLiabilityCap: 200,
    perPlayerPerGameCap: 600,
  },
  med: {
    bankroll: 100000,
    baseMargin: 0.05,
    drawExtraMargin: 0.07,
    perBetLiabilityCap: 400,
    perPlayerPerGameCap: 1200,
  },
  high: {
    bankroll: 200000,
    baseMargin: 0.04,
    drawExtraMargin: 0.06,
    perBetLiabilityCap: 800,
    perPlayerPerGameCap: 2400,
  },
};

export const applyRiskPresetHandler: import('express').RequestHandler = async (req, res) => {
  try {
    const lvl = String(req.body?.level || '').toLowerCase();
    if (!['low', 'med', 'high'].includes(lvl)) {
      return res.status(400).json({ error: 'Invalid level' });
    }
    const patch = PRESETS[lvl];
    const cfg = updateOverrides(patch);
    return res.status(200).json(cfg);
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || 'Failed to apply preset' });
  }
};
