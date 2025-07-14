const express = require('express');
const {
  getTerritoryControls,
  getTerritoryControl,
  getTerritoryControlByDate,
  getAvailableDates,
  createTerritoryControl,
  importTerritoryControl,
  updateTerritoryControl,
  updateTerritoryControlMetadata,
  addFeature,
  removeFeature,
  deleteTerritoryControl,
  getTerritoryControlStats,
  getControllerStats,
  getTerritoryTimeline,
  getControlChanges,
  getTerritorialDistribution,
  getCurrentTerritoryControl,
  getClosestTerritoryControl
} = require('../controllers/territoryControlController');

const {
  validateRequest,
  territoryControlRules,
  territoryControlUpdateRules,
  territoryControlMetadataRules,
  territoryControlFeatureRules,
  idParamRules,
  dateParamRules,
  territoryControlFilterRules
} = require('../middleware/validators');

const { protect, authorize } = require('../middleware/auth');

const router = express.Router();

// Public routes - SPECIFIC ROUTES FIRST

// Stats routes (before /:id to avoid conflicts)
router.get('/stats', getTerritoryControlStats);
router.get('/stats/controllers', getControllerStats);

// Utility routes
router.get('/dates', getAvailableDates);
router.get('/current', getCurrentTerritoryControl);
router.get('/timeline', getTerritoryTimeline);
router.get('/changes', getControlChanges);

// Date-specific routes
router.get('/date/:date', dateParamRules, validateRequest, getTerritoryControlByDate);
router.get('/closest/:date', dateParamRules, validateRequest, getClosestTerritoryControl);
router.get('/distribution/:date', dateParamRules, validateRequest, getTerritorialDistribution);

// Main collection route
router.get('/', territoryControlFilterRules, validateRequest, getTerritoryControls);

// Individual record route
router.get('/:id', idParamRules, validateRequest, getTerritoryControl);

// Protected routes

// Create routes
router.post(
  '/',
  protect,
  authorize('editor', 'admin'),
  territoryControlRules,
  validateRequest,
  createTerritoryControl
);

router.post(
  '/import',
  protect,
  authorize('editor', 'admin'),
  territoryControlRules,
  validateRequest,
  importTerritoryControl
);

// Update routes
router.put(
  '/:id',
  protect,
  authorize('editor', 'admin'),
  idParamRules,
  territoryControlUpdateRules,
  validateRequest,
  updateTerritoryControl
);

router.put(
  '/:id/metadata',
  protect,
  authorize('editor', 'admin'),
  idParamRules,
  territoryControlMetadataRules,
  validateRequest,
  updateTerritoryControlMetadata
);

// Feature management routes
router.post(
  '/:id/features',
  protect,
  authorize('editor', 'admin'),
  idParamRules,
  territoryControlFeatureRules,
  validateRequest,
  addFeature
);

router.delete(
  '/:id/features/:featureIndex',
  protect,
  authorize('editor', 'admin'),
  idParamRules,
  validateRequest,
  removeFeature
);

// Delete routes (admin only)
router.delete(
  '/:id',
  protect,
  authorize('admin'),
  idParamRules,
  validateRequest,
  deleteTerritoryControl
);

module.exports = router; 