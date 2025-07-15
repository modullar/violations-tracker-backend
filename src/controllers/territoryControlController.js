const ErrorResponse = require('../utils/errorResponse');
const asyncHandler = require('../utils/asyncHandler');
const { addColorsToTerritoryControl } = require('../config/territorColorMapping');
const {
  // Create operations
  createTerritoryControl,
  createTerritoryControlFromData,
  // Update operations
  updateTerritoryControl,
  addFeatureToTerritoryControl,
  removeFeatureFromTerritoryControl,
  updateTerritoryControlMetadata,
  // Delete operations
  deleteTerritoryControl,
  // Query operations
  getTerritoryControls,
  getTerritoryControlById,
  getTerritoryControlByDate,
  getClosestTerritoryControlToDate,
  getAvailableDates,
  // Stats operations
  getTerritoryControlStats,
  getControllerStats,
  getTerritoryTimeline,
  getControlChangesSummary,
  getTerritorialDistribution
} = require('../commands/territoryControl');

/**
 * @desc    Get all territory controls with filtering, sorting, and pagination
 * @route   GET /api/territory-control
 * @access  Public
 */
exports.getTerritoryControls = asyncHandler(async (req, res, next) => {
  const paginationOptions = {
    page: parseInt(req.query.page, 10) || 1,
    limit: parseInt(req.query.limit, 10) || 10,
    sort: req.query.sort || '-date'
  };

  const result = await getTerritoryControls(req.query, paginationOptions);

  // Add color attributes to features for each territory control
  const territoryControlsWithColors = result.territoryControls.map(territoryControl => 
    addColorsToTerritoryControl(territoryControl)
  );

  res.status(200).json({
    success: true,
    count: result.totalDocs,
    pagination: result.pagination,
    data: territoryControlsWithColors
  });
});

/**
 * @desc    Get territory control by ID
 * @route   GET /api/territory-control/:id
 * @access  Public
 */
exports.getTerritoryControl = asyncHandler(async (req, res, next) => {
  const territoryControl = await getTerritoryControlById(req.params.id);

  if (!territoryControl) {
    return next(
      new ErrorResponse(`Territory control not found with id of ${req.params.id}`, 404)
    );
  }

  // Add color attributes to features
  const territoryControlWithColors = addColorsToTerritoryControl(territoryControl);

  res.status(200).json({
    success: true,
    data: territoryControlWithColors
  });
});

/**
 * @desc    Get territory control for a specific date
 * @route   GET /api/territory-control/date/:date
 * @access  Public
 */
exports.getTerritoryControlByDate = asyncHandler(async (req, res, next) => {
  const { date } = req.params;
  const { controlledBy } = req.query;

  const territoryControl = await getTerritoryControlByDate(date, { controlledBy });

  if (!territoryControl) {
    // Try to find the closest date
    const closestControl = await getClosestTerritoryControlToDate(date);
    
    if (!closestControl) {
      return next(
        new ErrorResponse(`No territory control data found for date ${date} or nearby dates`, 404)
      );
    }

    // Add color attributes to features
    const closestControlWithColors = addColorsToTerritoryControl(closestControl);

    return res.status(200).json({
      success: true,
      data: closestControlWithColors,
      note: `No data found for ${date}. Returning closest available data from ${new Date(closestControl.date).toISOString().split('T')[0]}`
    });
  }

  // Add color attributes to features
  const territoryControlWithColors = addColorsToTerritoryControl(territoryControl);

  res.status(200).json({
    success: true,
    data: territoryControlWithColors
  });
});

/**
 * @desc    Get available dates that have territory control data
 * @route   GET /api/territory-control/dates
 * @access  Public
 */
exports.getAvailableDates = asyncHandler(async (req, res, next) => {
  const dates = await getAvailableDates();

  res.status(200).json({
    success: true,
    count: dates.length,
    data: dates
  });
});

/**
 * @desc    Create new territory control
 * @route   POST /api/territory-control
 * @access  Private (Editors and Admins)
 */
exports.createTerritoryControl = asyncHandler(async (req, res, next) => {
  try {
    const territoryControl = await createTerritoryControl(req.body, req.user.id, {
      allowDuplicateDates: req.body.allowDuplicateDates || false
    });
    
    res.status(201).json({
      success: true,
      data: territoryControl
    });
  } catch (error) {
    return next(new ErrorResponse(error.message, 400));
  }
});

/**
 * @desc    Create territory control from external data
 * @route   POST /api/territory-control/import
 * @access  Private (Editors and Admins)
 */
exports.importTerritoryControl = asyncHandler(async (req, res, next) => {
  try {
    const territoryControl = await createTerritoryControlFromData(req.body, req.user.id, {
      allowDuplicateDates: req.body.allowDuplicateDates || false
    });
    
    res.status(201).json({
      success: true,
      data: territoryControl,
      imported: true
    });
  } catch (error) {
    return next(new ErrorResponse(error.message, 400));
  }
});

/**
 * @desc    Update territory control
 * @route   PUT /api/territory-control/:id
 * @access  Private (Editors and Admins)
 */
exports.updateTerritoryControl = asyncHandler(async (req, res, next) => {
  try {
    const territoryControl = await updateTerritoryControl(
      req.params.id,
      req.body,
      req.user.id,
      {
        allowDuplicateDates: req.body.allowDuplicateDates || false
      }
    );
    
    res.status(200).json({
      success: true,
      data: territoryControl
    });
  } catch (error) {
    if (error instanceof ErrorResponse) {
      return next(error);
    }
    return next(new ErrorResponse(error.message, 400));
  }
});

/**
 * @desc    Update territory control metadata
 * @route   PUT /api/territory-control/:id/metadata
 * @access  Private (Editors and Admins)
 */
exports.updateTerritoryControlMetadata = asyncHandler(async (req, res, next) => {
  try {
    const territoryControl = await updateTerritoryControlMetadata(
      req.params.id,
      req.body,
      req.user.id
    );
    
    res.status(200).json({
      success: true,
      data: territoryControl
    });
  } catch (error) {
    if (error instanceof ErrorResponse) {
      return next(error);
    }
    return next(new ErrorResponse(error.message, 400));
  }
});

/**
 * @desc    Add feature to territory control
 * @route   POST /api/territory-control/:id/features
 * @access  Private (Editors and Admins)
 */
exports.addFeature = asyncHandler(async (req, res, next) => {
  try {
    const territoryControl = await addFeatureToTerritoryControl(
      req.params.id,
      req.body,
      req.user.id
    );
    
    res.status(200).json({
      success: true,
      data: territoryControl
    });
  } catch (error) {
    if (error instanceof ErrorResponse) {
      return next(error);
    }
    return next(new ErrorResponse(error.message, 400));
  }
});

/**
 * @desc    Remove feature from territory control
 * @route   DELETE /api/territory-control/:id/features/:featureIndex
 * @access  Private (Editors and Admins)
 */
exports.removeFeature = asyncHandler(async (req, res, next) => {
  try {
    const featureIndex = parseInt(req.params.featureIndex, 10);
    
    if (isNaN(featureIndex)) {
      return next(new ErrorResponse('Invalid feature index', 400));
    }
    
    const territoryControl = await removeFeatureFromTerritoryControl(
      req.params.id,
      featureIndex,
      req.user.id
    );
    
    res.status(200).json({
      success: true,
      data: territoryControl
    });
  } catch (error) {
    if (error instanceof ErrorResponse) {
      return next(error);
    }
    return next(new ErrorResponse(error.message, 400));
  }
});

/**
 * @desc    Delete territory control
 * @route   DELETE /api/territory-control/:id
 * @access  Private (Admin only)
 */
exports.deleteTerritoryControl = asyncHandler(async (req, res, next) => {
  try {
    await deleteTerritoryControl(req.params.id, {
      preventLastDeletion: req.query.preventLastDeletion !== 'false'
    });
    
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
 * @desc    Get territory control statistics
 * @route   GET /api/territory-control/stats
 * @access  Public
 */
exports.getTerritoryControlStats = asyncHandler(async (req, res, next) => {
  const stats = await getTerritoryControlStats();

  res.status(200).json({
    success: true,
    data: stats
  });
});

/**
 * @desc    Get controller statistics
 * @route   GET /api/territory-control/stats/controllers
 * @access  Public
 */
exports.getControllerStats = asyncHandler(async (req, res, next) => {
  const options = {
    date: req.query.date,
    startDate: req.query.startDate,
    endDate: req.query.endDate
  };

  const stats = await getControllerStats(options);

  res.status(200).json({
    success: true,
    data: stats
  });
});

/**
 * @desc    Get territory control timeline
 * @route   GET /api/territory-control/timeline
 * @access  Public
 */
exports.getTerritoryTimeline = asyncHandler(async (req, res, next) => {
  const options = {
    startDate: req.query.startDate,
    endDate: req.query.endDate,
    controlledBy: req.query.controlledBy,
    limit: parseInt(req.query.limit, 10) || 100
  };

  const timeline = await getTerritoryTimeline(options);

  res.status(200).json({
    success: true,
    data: timeline
  });
});

/**
 * @desc    Get control changes between two dates
 * @route   GET /api/territory-control/changes
 * @access  Public
 */
exports.getControlChanges = asyncHandler(async (req, res, next) => {
  const { startDate, endDate } = req.query;

  if (!startDate || !endDate) {
    return next(new ErrorResponse('Both startDate and endDate are required', 400));
  }

  const changes = await getControlChangesSummary(startDate, endDate);

  res.status(200).json({
    success: true,
    data: changes
  });
});

/**
 * @desc    Get territorial distribution for a specific date
 * @route   GET /api/territory-control/distribution/:date
 * @access  Public
 */
exports.getTerritorialDistribution = asyncHandler(async (req, res, next) => {
  const { date } = req.params;

  const distribution = await getTerritorialDistribution(date);

  res.status(200).json({
    success: true,
    data: distribution
  });
});

/**
 * @desc    Get current territory control (most recent)
 * @route   GET /api/territory-control/current
 * @access  Public
 */
exports.getCurrentTerritoryControl = asyncHandler(async (req, res, next) => {
  const { controlledBy } = req.query;
  
  // Get the most recent date
  const dates = await getAvailableDates();
  
  if (dates.length === 0) {
    return next(new ErrorResponse('No territory control data available', 404));
  }

  const mostRecentDate = dates[0];
  const territoryControl = await getTerritoryControlByDate(mostRecentDate, { controlledBy });

  // Add color attributes to features
  const territoryControlWithColors = addColorsToTerritoryControl(territoryControl);

  res.status(200).json({
    success: true,
    data: territoryControlWithColors,
    isCurrent: true
  });
});

/**
 * @desc    Get closest territory control to a date
 * @route   GET /api/territory-control/closest/:date
 * @access  Public
 */
exports.getClosestTerritoryControl = asyncHandler(async (req, res, next) => {
  const { date } = req.params;

  const territoryControl = await getClosestTerritoryControlToDate(date);

  if (!territoryControl) {
    return next(new ErrorResponse('No territory control data available', 404));
  }

  // Add color attributes to features
  const territoryControlWithColors = addColorsToTerritoryControl(territoryControl);

  res.status(200).json({
    success: true,
    data: territoryControlWithColors,
    requestedDate: date,
    actualDate: new Date(territoryControl.date).toISOString().split('T')[0]
  });
}); 