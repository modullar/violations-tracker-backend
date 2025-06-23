const express = require('express');
const {
  parseReport,
  getJobStatus,
  getAllJobs,
  getReports,
  getReport,
  getReportStats,
  getReportsReadyForProcessing,
  markReportAsProcessed,
  markReportAsFailed
} = require('../controllers/reportController');
const { protect, authorize } = require('../middleware/auth');
const { validateRequest, idParamRules } = require('../middleware/validators');

const router = express.Router();

// Public routes
router.get('/', getReports);
router.get('/:id', idParamRules, validateRequest, getReport);

// Protected routes - Report parsing
router.post('/parse', protect, authorize('editor', 'admin'), parseReport);
router.get('/jobs/:jobId', protect, getJobStatus);
router.get('/jobs', protect, authorize('admin'), getAllJobs);

// Protected routes - Report management (Admin only)  
router.get('/stats', protect, authorize('admin'), getReportStats);
router.get('/ready-for-processing', protect, authorize('admin'), getReportsReadyForProcessing);
router.put('/:id/mark-processed', protect, authorize('admin'), idParamRules, validateRequest, markReportAsProcessed);
router.put('/:id/mark-failed', protect, authorize('admin'), idParamRules, validateRequest, markReportAsFailed);

module.exports = router;