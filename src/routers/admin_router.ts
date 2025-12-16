import express from 'express';
import { requireAdminAccess } from '../authentication/requireAdminAccess';
import adminRiskController from '../controllers/admin_risk_controller';
import adminDevController from '../controllers/admin_dev_controller';
import adminFeaturesController from '../controllers/admin_features_controller';
import adminHomeController from '../controllers/admin_home_controller';

const router = express();

// Risk config
router.get('/risk/config', requireAdminAccess, adminRiskController.getRiskConfig);
router.put('/risk/config', express.json(), requireAdminAccess, adminRiskController.updateRiskConfig);

// Exposure
router.get('/exposure/global', requireAdminAccess, adminRiskController.getGlobalExposure);
router.get('/exposure/games/:gameId', requireAdminAccess, adminRiskController.getGameExposure);

// Feature flags (DB-backed)
router.get('/features', requireAdminAccess, adminFeaturesController.getFeatures);
router.put('/features', express.json(), requireAdminAccess, adminFeaturesController.updateFeatures);

// Admin home snapshot
router.get('/home', requireAdminAccess, adminHomeController.getAdminHome);

// Optional: reset in‑memory overrides (dev/staging convenience)
router.post('/risk/reset', requireAdminAccess, (req, res) => {
  const { clearOverrides, getRiskConfig } = require('../helpers/risk_config');
  clearOverrides();
  const cfg = getRiskConfig();
  res.status(200).json(cfg);
});

// Danger zone: clear all wagers (dev)
router.post('/dev/clear-wagers', requireAdminAccess, adminDevController.clearAllWagers);

export default router;
