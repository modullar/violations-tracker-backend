const express = require('express');
const {
  getViolations,
  getViolation,
  createViolation,
  updateViolation,
  deleteViolation,
  getViolationsInRadius,
  getViolationsByType,
  getViolationsByLocation,
  getViolationsByYear,
  getViolationsTotal
} = require('../controllers/violationsController');

const {
  validateRequest,
  violationRules,
  idParamRules,
  violationFilterRules
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