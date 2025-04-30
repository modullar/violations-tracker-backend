const express = require('express');
const {
  getViolations,
  getViolation,
  createViolation,
  createViolationsBatch,
  updateViolation,
  deleteViolation,
  getViolationsInRadius,
  getViolationsByType,
  getViolationsByLocation,
  getViolationsByYear,
  getViolationsTotal,
  parseViolationReport
} = require('../controllers/violationsController');

const {
  validateRequest,
  violationRules,
  batchViolationsRules,
  idParamRules,
  violationFilterRules,
  violationParsingRules
} = require('../middleware/validators');

const { protect, authorize } = require('../middleware/auth');

const router = express.Router();

// Public routes
router.get('/', violationFilterRules, validateRequest, getViolations);
router.get('/stats/type', protect, authorize('admin'), getViolationsByType);
router.get('/stats/location', protect, authorize('admin'), getViolationsByLocation);
router.get('/stats/yearly', protect, authorize('admin'), getViolationsByYear);
router.get('/stats/total', protect, authorize('admin'), getViolationsTotal);
router.get('/radius/:latitude/:longitude/:radius', getViolationsInRadius);
router.get('/:id', idParamRules, validateRequest, getViolation);

// Protected routes
router.post(
  '/',
  protect,
  authorize('editor', 'admin'),
  violationRules,
  validateRequest,
  createViolation
);

router.post(
  '/batch',
  protect,
  authorize('editor', 'admin'),
  batchViolationsRules,
  validateRequest,
  createViolationsBatch
);

router.post(
  '/parse',
  protect,
  authorize('editor', 'admin'),
  violationParsingRules,
  validateRequest,
  parseViolationReport
);

router.put(
  '/:id',
  protect,
  authorize('editor', 'admin'),
  idParamRules,
  violationRules,
  validateRequest,
  updateViolation
);

router.delete(
  '/:id',
  protect,
  authorize('admin'),
  idParamRules,
  validateRequest,
  deleteViolation
);

module.exports = router;