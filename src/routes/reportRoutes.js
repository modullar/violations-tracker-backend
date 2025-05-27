const express = require('express');
const { parseReport, getJobStatus, getAllJobs } = require('../controllers/reportController');
const { protect, authorize } = require('../middleware/auth');
const { validateRequest } = require('../middleware/validators');
const { body, param } = require('express-validator');

const router = express.Router();

// Validation rules for report parsing
const reportParsingRules = [
  body('reportText')
    .notEmpty()
    .withMessage('Report text is required')
    .isLength({ min: 50 })
    .withMessage('Report text should be at least 50 characters'),
  
  body('sourceURL.name')
    .optional()
    .notEmpty()
    .withMessage('Source name is required when providing source information'),
  
  body('sourceURL.url')
    .optional()
    .isURL()
    .withMessage('Source URL must be a valid URL'),
  
  body('sourceURL.reportDate')
    .optional()
    .isString()
    .withMessage('Report date must be a string')
];

// Validation rules for job ID parameter
const jobIdParamRules = [
  param('jobId')
    .notEmpty()
    .withMessage('Job ID is required')
    .isMongoId()
    .withMessage('Invalid job ID format')
];

// Routes
router.post(
  '/parse',
  protect,
  authorize('editor', 'admin'),
  reportParsingRules,
  validateRequest,
  parseReport
);

router.get(
  '/jobs/:jobId',
  protect,
  jobIdParamRules,
  validateRequest,
  getJobStatus
);

router.get(
  '/jobs',
  protect,
  authorize('admin'),
  getAllJobs
);

module.exports = router;