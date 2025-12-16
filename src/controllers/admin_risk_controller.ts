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

