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
  markReportAsFailed,
  triggerManualScraping,
  startTelegramScraping,
  stopTelegramScraping,
  getScrapingJobStatus
} = require('../controllers/reportController');
const { protect, authorize } = require('../middleware/auth');
const { validateRequest, idParamRules } = require('../middleware/validators');

const router = express.Router();

// Public routes - SPECIFIC ROUTES FIRST
router.get('/', getReports);

// Protected routes - Report parsing
router.post('/parse', protect, authorize('editor', 'admin'), parseReport);
router.get('/jobs/:jobId', protect, getJobStatus);
router.get('/jobs', protect, authorize('admin'), getAllJobs);

// Protected routes - Report management (Admin only) - SPECIFIC ROUTES BEFORE PARAMETERIZED
router.get('/stats', protect, authorize('admin'), getReportStats);
router.get('/ready-for-processing', protect, authorize('admin'), getReportsReadyForProcessing);

// Protected routes - Telegram scraping job management (Admin only)
router.post('/scraping/trigger', protect, authorize('admin'), triggerManualScraping);
router.post('/scraping/start', protect, authorize('admin'), startTelegramScraping);
router.post('/scraping/stop', protect, authorize('admin'), stopTelegramScraping);
router.get('/scraping/status', protect, authorize('admin'), getScrapingJobStatus);

// PARAMETERIZED ROUTES LAST - these catch-all routes must be at the end
router.get('/:id', idParamRules, validateRequest, getReport);
router.put('/:id/mark-processed', protect, authorize('admin'), idParamRules, validateRequest, markReportAsProcessed);
router.put('/:id/mark-failed', protect, authorize('admin'), idParamRules, validateRequest, markReportAsFailed);

module.exports = router;