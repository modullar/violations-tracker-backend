const ErrorResponse = require('../utils/errorResponse');
const asyncHandler = require('../utils/asyncHandler');
const {
  // Create operations
  createSingleViolation,
  createBatchViolations,
  // Update operations
  updateViolation,
  // Delete operations
  deleteViolation,
  // Query operations
  getViolations,
  getViolationsInRadius,
  getViolationById,
  // Stats operations
  getViolationStats,
  getViolationsByType,
  getViolationsByLocation,
  getViolationsByYear,
  getViolationsTotal
} = require('../commands/violations');

/**
 * @desc    Get all violations with filtering, sorting, and pagination
 * @route   GET /api/violations
 * @access  Public
 */
exports.getViolations = asyncHandler(async (req, res, next) => {
  const paginationOptions = {
    page: parseInt(req.query.page, 10) || 1,
    limit: parseInt(req.query.limit, 10) || 10,
    sort: req.query.sort || '-date'
  };

  const result = await getViolations(req.query, paginationOptions);

  res.status(200).json({
    success: true,
    count: result.totalDocs,
    pagination: result.pagination,
    data: result.violations
  });
});

/**
 * @desc    Get violations within a specified radius
 * @route   GET /api/violations/radius/:latitude/:longitude/:radius
 * @access  Public
 */
exports.getViolationsInRadius = asyncHandler(async (req, res, next) => {
  const { latitude, longitude, radius } = req.params;

  const violations = await getViolationsInRadius(latitude, longitude, radius);

  res.status(200).json({
    success: true,
    count: violations.length,
    data: violations
  });
});

/**
 * @desc    Get violation by ID
 * @route   GET /api/violations/:id
 * @access  Public
 */
exports.getViolation = asyncHandler(async (req, res, next) => {
  const violation = await getViolationById(req.params.id);

  if (!violation) {
    return next(
      new ErrorResponse(`Violation not found with id of ${req.params.id}`, 404)
    );
  }

  res.status(200).json({
    success: true,
    data: violation
  });
});

/**
 * @desc    Create new violation
 * @route   POST /api/violations
 * @access  Private (Editors and Admins)
 */
exports.createViolation = asyncHandler(async (req, res, next) => {
  try {
    const { action = 'create', ...violationData } = req.body;
    
    const result = await createSingleViolation(violationData, req.user.id, action);
    
    const statusCode = result.action === 'merged' ? 200 : 201;
    const message = result.action === 'merged' 
      ? 'Violation merged with existing duplicate' 
      : 'Violation created successfully';
    
    res.status(statusCode).json({
      success: true,
      message,
      data: {
        violation: result.violation,
        duplicates: result.duplicates,
        action: result.action
      }
    });
  } catch (error) {
    return next(new ErrorResponse(error.message, 400));
  }
});

/**
 * @desc    Update violation
 * @route   PUT /api/violations/:id
 * @access  Private (Editors and Admins)
 */
exports.updateViolation = asyncHandler(async (req, res, next) => {
  try {
    const violation = await updateViolation(req.params.id, req.body, req.user.id);
    
    res.status(200).json({
      success: true,
      data: violation
    });
  } catch (error) {
    if (error instanceof ErrorResponse) {
      return next(error);
    }
    return next(new ErrorResponse(error.message, 400));
  }
});

/**
 * @desc    Delete violation
 * @route   DELETE /api/violations/:id
 * @access  Private (Admin only)
 */
exports.deleteViolation = asyncHandler(async (req, res, next) => {
  try {
    await deleteViolation(req.params.id);
    
    res.status(200).json({
      success: true,
      data: {}
    });
  } catch (error) {
    if (error instanceof ErrorResponse) {
      return next(error);
    }
    return next(new ErrorResponse(error.message, 400));
  }
});

/**
 * @desc    Get violation statistics
 * @route   GET /api/violations/stats
 * @access  Public
 */
exports.getViolationStats = asyncHandler(async (req, res, next) => {
  const stats = await getViolationStats();

  res.status(200).json({
    success: true,
    data: stats
  });
});

/**
 * @desc    Get violations by type
 * @route   GET /api/violations/stats/type
 * @access  Private (Admin)
 */
exports.getViolationsByType = asyncHandler(async (req, res, next) => {
  const stats = await getViolationsByType();

  res.status(200).json({
    success: true,
    data: stats
  });
});

/**
 * @desc    Get violations by location
 * @route   GET /api/violations/stats/location
 * @access  Private (Admin)
 */
exports.getViolationsByLocation = asyncHandler(async (req, res, next) => {
  const stats = await getViolationsByLocation();

  res.status(200).json({
    success: true,
    data: stats
  });
});

/**
 * @desc    Get yearly violation counts
 * @route   GET /api/violations/stats/yearly
 * @access  Private (Admin)
 */
exports.getViolationsByYear = asyncHandler(async (req, res, next) => {
  const stats = await getViolationsByYear();

  res.status(200).json({
    success: true,
    data: stats
  });
});

/**
 * @desc    Get total violation count
 * @route   GET /api/violations/stats/total
 * @access  Private (Admin)
 */
exports.getViolationsTotal = asyncHandler(async (req, res, next) => {
  const total = await getViolationsTotal();

  res.status(200).json({
    success: true,
    data: { total }
  });
});

/**
 * @desc    Create multiple violations in a batch
 * @route   POST /api/violations/batch
 * @access  Private (Editors and Admins)
 */
exports.createViolationsBatch = asyncHandler(async (req, res, next) => {
  try {
    const { action = 'create', violations: violationsData } = req.body;
    
    // If action is provided at the root level, use it; otherwise check if it's in the array
    const actualViolationsData = violationsData || req.body;
    const actualAction = action || 'create';
    
    const result = await createBatchViolations(actualViolationsData, req.user.id, actualAction);
    
    // Count merged vs created
    const mergedCount = result.results ? result.results.filter(r => r.action === 'merged').length : 0;
    const createdCount = result.results ? result.results.filter(r => r.action === 'created').length : 0;
    
    res.status(201).json({
      success: true,
      message: `Batch processing completed: ${createdCount} created, ${mergedCount} merged`,
      count: result.violations.length,
      data: {
        violations: result.violations,
        results: result.results,
        summary: {
          total: result.violations.length,
          created: createdCount,
          merged: mergedCount
        }
      },
      errors: result.errors
    });
  } catch (error) {
    if (error instanceof ErrorResponse) {
      return next(error);
    }
    return next(new ErrorResponse(error.message, 400));
  }
});