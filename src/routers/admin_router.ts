import express from 'express';
import { requireAdminAccess } from '../authentication/requireAdminAccess';
import requireAuth from '../authentication/requireAuth';
import adminRiskController, { applyRiskPresetHandler } from '../controllers/admin_risk_controller';
import adminDevController, { createSampleGame, advanceMoveDev, simulateGameDev, stopSimulateDev } from '../controllers/admin_dev_controller';
import adminFeaturesController from '../controllers/admin_features_controller';
import adminHomeController from '../controllers/admin_home_controller';
import adminWalletController from '../controllers/admin_wallet_controller';
import adminOpsController from '../controllers/admin_ops_controller';
import adminWagerController from '../controllers/admin_wager_controller';

const router = express.Router();

// Risk config
router.get('/risk/config', requireAdminAccess, adminRiskController.getRiskConfig);
router.put('/risk/config', express.json(), requireAdminAccess, adminRiskController.updateRiskConfig);
router.post('/risk/preset', express.json(), requireAdminAccess, applyRiskPresetHandler);

// Exposure
router.get('/exposure/global', requireAdminAccess, adminRiskController.getGlobalExposure);
router.get('/exposure/games/:gameId', requireAdminAccess, adminRiskController.getGameExposure);

// Feature flags (DB-backed)
router.get('/features', requireAdminAccess, adminFeaturesController.getFeatures);
router.put('/features', express.json(), requireAdminAccess, adminFeaturesController.updateFeatures);

// Admin home snapshot
router.get('/home', requireAdminAccess, adminHomeController.getAdminHome);

// Wallet/deposits (admin view)
router.get('/wallet/deposits', requireAdminAccess, adminWalletController.listDeposits);
// Dev/staging helper: clear stale pending invoices
router.post('/dev/clear-stale-invoices', requireAdminAccess, express.json(), adminWalletController.clearStaleInvoices);
// Dev/staging helper: clear stale pending wagers (Real WDL only)
router.post('/dev/clear-stale-wagers', requireAdminAccess, express.json(), adminWagerController.clearStaleWagers);

// Ops & health
router.get('/ops/stats', requireAdminAccess, adminOpsController.getOpsStats);
router.get('/ops/ping', requireAdminAccess, adminOpsController.pingMicroservice);

// Optional: reset in‑memory overrides (dev/staging convenience)
router.post('/risk/reset', requireAdminAccess, (req, res) => {
  const { clearOverrides, getRiskConfig } = require('../helpers/risk_config');
  clearOverrides();
  const cfg = getRiskConfig();
  res.status(200).json(cfg);
});

// Danger zone: clear all wagers (dev)
router.post('/dev/clear-wagers', requireAdminAccess, adminDevController.clearAllWagers);

// Dev-only: create a deterministic sample game for E2E tests
router.post('/dev/create-sample-game', express.json(), requireAdminAccess, createSampleGame);

// Dev-only (non-production): allow any authenticated user to create a sample game for testing
router.post('/dev/create-sample-game-open', express.json(), requireAuth, (req, res, next) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({ error: 'Forbidden' });
  }
  return createSampleGame(req, res, next);
});

// Dev-only (non-production): simple simulator endpoints for deterministic testing
router.post('/dev/advance-move', express.json(), requireAuth, (req, res, next) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({ error: 'Forbidden' });
  }
  return advanceMoveDev(req, res, next);
});

router.post('/dev/simulate-game', express.json(), requireAuth, (req, res, next) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({ error: 'Forbidden' });
  }
  return simulateGameDev(req, res, next);
});

router.post('/dev/stop-simulate', express.json(), requireAuth, (req, res, next) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({ error: 'Forbidden' });
  }
  return stopSimulateDev(req, res, next);
});

export default router;
