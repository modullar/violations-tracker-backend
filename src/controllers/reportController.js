const asyncHandler = require('../utils/asyncHandler');
const ErrorResponse = require('../utils/errorResponse');
const logger = require('../config/logger');
const ReportParsingJob = require('../models/jobs/ReportParsingJob');
const queueService = require('../services/queueService');
const Report = require('../models/Report');

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

/**
 * @desc    Get all scraped reports with filtering, sorting, and pagination
 * @route   GET /api/reports
 * @access  Public
 */
exports.getReports = asyncHandler(async (req, res, next) => {
  const paginationOptions = {
    page: parseInt(req.query.page, 10) || 1,
    limit: parseInt(req.query.limit, 10) || 10,
    sort: req.query.sort || '-metadata.scrapedAt'
  };

  // Build filter object
  const filter = {};

  // Filter by channel
  if (req.query.channel) {
    filter['metadata.channel'] = req.query.channel;
  }

  // Filter by parsed status
  if (req.query.parsedByLLM !== undefined) {
    filter.parsedByLLM = req.query.parsedByLLM === 'true';
  }

  // Filter by status
  if (req.query.status) {
    filter.status = req.query.status;
  }

  // Filter by language
  if (req.query.language) {
    filter['metadata.language'] = req.query.language;
  }

  // Filter by date range
  if (req.query.startDate || req.query.endDate) {
    filter.date = {};
    if (req.query.startDate) {
      filter.date.$gte = new Date(req.query.startDate);
    }
    if (req.query.endDate) {
      filter.date.$lte = new Date(req.query.endDate);
    }
  }

  // Filter by scraped date range
  if (req.query.scrapedStartDate || req.query.scrapedEndDate) {
    filter['metadata.scrapedAt'] = {};
    if (req.query.scrapedStartDate) {
      filter['metadata.scrapedAt'].$gte = new Date(req.query.scrapedStartDate);
    }
    if (req.query.scrapedEndDate) {
      filter['metadata.scrapedAt'].$lte = new Date(req.query.scrapedEndDate);
    }
  }

  // Filter by keywords
  if (req.query.keyword) {
    filter['metadata.matchedKeywords'] = { $in: [req.query.keyword] };
  }

  // Text search
  if (req.query.search) {
    filter.$text = { $search: req.query.search };
  }

  try {
    const result = await Report.paginate(filter, paginationOptions);

    // Format pagination info
    const pagination = {
      page: result.page,
      pages: result.totalPages,
      limit: result.limit,
      total: result.totalDocs,
      hasNext: result.hasNextPage,
      hasPrev: result.hasPrevPage
    };

    res.status(200).json({
      success: true,
      count: result.docs.length,
      pagination,
      data: result.docs
    });
  } catch (error) {
    return next(new ErrorResponse('Error fetching reports', 500));
  }
});

/**
 * @desc    Get report by ID
 * @route   GET /api/reports/:id
 * @access  Public
 */
exports.getReport = asyncHandler(async (req, res, next) => {
  try {
    const report = await Report.findById(req.params.id)
      .populate('parsingJobId', 'status progress results');

    if (!report) {
      return next(new ErrorResponse(`Report not found with id of ${req.params.id}`, 404));
    }

    res.status(200).json({
      success: true,
      data: report
    });
  } catch (error) {
    return next(new ErrorResponse(`Report not found with id of ${req.params.id}`, 404));
  }
});

/**
 * @desc    Get reports statistics
 * @route   GET /api/reports/stats
 * @access  Private (Admin)
 */
exports.getReportStats = asyncHandler(async (req, res, next) => {
  try {
    // Get basic counts
    const totalReports = await Report.countDocuments();
    const parsedReports = await Report.countDocuments({ parsedByLLM: true });
    const unparsedReports = await Report.countDocuments({ parsedByLLM: false });
    const recentReports = await Report.countDocuments({
      'metadata.scrapedAt': { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
    });

    // Get reports by channel
    const channelStats = await Report.aggregate([
      {
        $group: {
          _id: '$metadata.channel',
          count: { $sum: 1 },
          parsed: { $sum: { $cond: ['$parsedByLLM', 1, 0] } },
          unparsed: { $sum: { $cond: ['$parsedByLLM', 0, 1] } }
        }
      },
      { $sort: { count: -1 } }
    ]);

    // Get reports by language
    const languageStats = await Report.aggregate([
      {
        $group: {
          _id: '$metadata.language',
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } }
    ]);

    // Get reports by status
    const statusStats = await Report.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } }
    ]);

    // Get top keywords
    const keywordStats = await Report.aggregate([
      { $unwind: '$metadata.matchedKeywords' },
      {
        $group: {
          _id: '$metadata.matchedKeywords',
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } },
      { $limit: 20 }
    ]);

    const stats = {
      summary: {
        total: totalReports,
        parsed: parsedReports,
        unparsed: unparsedReports,
        recent24h: recentReports,
        parsingRate: totalReports > 0 ? ((parsedReports / totalReports) * 100).toFixed(2) : 0
      },
      channels: channelStats,
      languages: languageStats,
      statuses: statusStats,
      topKeywords: keywordStats
    };

    res.status(200).json({
      success: true,
      data: stats
    });
  } catch (error) {
    return next(new ErrorResponse('Error fetching report statistics', 500));
  }
});

/**
 * @desc    Get reports ready for LLM processing
 * @route   GET /api/reports/ready-for-processing
 * @access  Private (Admin)
 */
exports.getReportsReadyForProcessing = asyncHandler(async (req, res, next) => {
  const limit = parseInt(req.query.limit, 10) || 10;

  try {
    const reports = await Report.findReadyForProcessing(limit);

    res.status(200).json({
      success: true,
      count: reports.length,
      data: reports
    });
  } catch (error) {
    return next(new ErrorResponse('Error fetching reports ready for processing', 500));
  }
});

/**
 * @desc    Mark report as processed
 * @route   PUT /api/reports/:id/mark-processed
 * @access  Private (Admin)
 */
exports.markReportAsProcessed = asyncHandler(async (req, res, next) => {
  try {
    const report = await Report.findById(req.params.id);

    if (!report) {
      return next(new ErrorResponse(`Report not found with id of ${req.params.id}`, 404));
    }

    const { jobId } = req.body;
    await report.markAsProcessed(jobId);

    res.status(200).json({
      success: true,
      data: report
    });
  } catch (error) {
    return next(new ErrorResponse('Error marking report as processed', 500));
  }
});

/**
 * @desc    Mark report as failed
 * @route   PUT /api/reports/:id/mark-failed
 * @access  Private (Admin)
 */
exports.markReportAsFailed = asyncHandler(async (req, res, next) => {
  try {
    const report = await Report.findById(req.params.id);

    if (!report) {
      return next(new ErrorResponse(`Report not found with id of ${req.params.id}`, 404));
    }

    const { errorMessage } = req.body;
    await report.markAsFailed(errorMessage || 'Processing failed');

    res.status(200).json({
      success: true,
      data: report
    });
  } catch (error) {
    return next(new ErrorResponse('Error marking report as failed', 500));
  }
});