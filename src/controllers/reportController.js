const asyncHandler = require('../utils/asyncHandler');
const ErrorResponse = require('../utils/errorResponse');
const logger = require('../config/logger');
const ReportParsingJob = require('../models/jobs/ReportParsingJob');
const queueService = require('../services/queueService');

/**
 * @desc    Submit a report for parsing
 * @route   POST /api/reports/parse
 * @access  Private (Editor, Admin)
 */
exports.parseReport = asyncHandler(async (req, res, next) => {
  const { reportText, sourceURL } = req.body;

  if (!reportText || reportText.trim().length < 50) {
    return next(new ErrorResponse('Report text is required and should be at least 50 characters', 400));
  }

  // Validate source URL if provided
  if (sourceURL && (!sourceURL.name || sourceURL.name.trim() === '')) {
    return next(new ErrorResponse('Source name is required when providing source information', 400));
  }

  // Estimate processing time based on text length (just an example calculation)
  const wordCount = reportText.split(/\s+/).length;
  const estimatedProcessingTime = `${Math.max(1, Math.ceil(wordCount / 200))} minutes`;

  // Create a job record in the database
  const job = await ReportParsingJob.create({
    reportText,
    sourceURL: sourceURL || { name: 'Manual submission' },
    submittedBy: req.user.id,
    status: 'queued',
    progress: 0,
    estimatedProcessingTime
  });

  // Add the job to the queue
  await queueService.addJob(job._id.toString());

  logger.info(`Report parsing job created: ${job._id}`);

  res.status(200).json({
    success: true,
    data: {
      jobId: job._id,
      estimatedProcessingTime,
      submittedAt: job.createdAt
    }
  });
});

/**
 * @desc    Get report parsing job status
 * @route   GET /api/reports/jobs/:jobId
 * @access  Private
 */
exports.getJobStatus = asyncHandler(async (req, res, next) => {
  const job = await ReportParsingJob.findById(req.params.jobId)
    .populate('submittedBy', 'name');

  if (!job) {
    return next(new ErrorResponse(`Job with ID ${req.params.jobId} not found`, 404));
  }

  // Check authorization - only admins or the job creator can view the job
  if (req.user.role !== 'admin' && job.submittedBy._id.toString() !== req.user.id) {
    return next(new ErrorResponse('Not authorized to access this job', 403));
  }

  // Return job details, excluding the full report text to reduce payload
  const jobDetails = {
    id: job._id,
    status: job.status,
    progress: job.progress,
    submittedBy: job.submittedBy.name,
    submittedAt: job.createdAt,
    estimatedProcessingTime: job.estimatedProcessingTime,
    source: job.sourceURL,
    error: job.error,
    results: {
      parsedViolationsCount: job.results.parsedViolationsCount,
      createdViolationsCount: job.results.createdViolationsCount,
      violations: job.results.violations,
      failedViolations: job.results.failedViolations
    }
  };

  res.status(200).json({
    success: true,
    data: jobDetails
  });
});

/**
 * @desc    Get all report parsing jobs (with pagination)
 * @route   GET /api/reports/jobs
 * @access  Private (Admin only)
 */
exports.getAllJobs = asyncHandler(async (req, res, next) => {
  // Set pagination options
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 10;
  const startIndex = (page - 1) * limit;

  // Filter options
  const filter = {};
  
  // Filter by status if provided
  if (req.query.status) {
    filter.status = req.query.status;
  }

  // Count total documents with filter
  const total = await ReportParsingJob.countDocuments(filter);

  // Get jobs with pagination
  const jobs = await ReportParsingJob.find(filter)
    .select('-reportText') // Exclude full report text
    .populate('submittedBy', 'name')
    .sort({ createdAt: -1 })
    .skip(startIndex)
    .limit(limit);

  // Create pagination result
  const pagination = {
    page,
    limit,
    totalPages: Math.ceil(total / limit),
    totalJobs: total
  };

  res.status(200).json({
    success: true,
    count: jobs.length,
    pagination,
    data: jobs
  });
});