const Violation = require('../models/Violation');
const ErrorResponse = require('../utils/errorResponse');
const asyncHandler = require('../utils/asyncHandler');
const { geocodeLocation } = require('../utils/geocoder');

/**
 * @desc    Get all violations with filtering, sorting, and pagination
 * @route   GET /api/violations
 * @access  Public
 */
exports.getViolations = asyncHandler(async (req, res, next) => {
  // Build query with filters
  const query = buildFilterQuery(req.query);
  
  // Pagination options
  const options = {
    page: parseInt(req.query.page, 10) || 1,
    limit: parseInt(req.query.limit, 10) || 10,
    sort: req.query.sort || '-date', // Default sort by date descending
    populate: [
      { path: 'created_by', select: 'name' },
      { path: 'updated_by', select: 'name' }
    ]
  };

  // Execute query with pagination
  const result = await Violation.paginate(query, options);

  res.status(200).json({
    success: true,
    count: result.totalDocs,
    pagination: {
      page: result.page,
      limit: result.limit,
      totalPages: result.totalPages,
      totalResults: result.totalDocs,
      hasNextPage: result.hasNextPage,
      hasPrevPage: result.hasPrevPage,
      nextPage: result.nextPage,
      prevPage: result.prevPage
    },
    data: result.docs
  });
});

/**
 * @desc    Get violations within a specified radius
 * @route   GET /api/violations/radius/:latitude/:longitude/:radius
 * @access  Public
 */
exports.getViolationsInRadius = asyncHandler(async (req, res, next) => {
  const { latitude, longitude, radius } = req.params;

  // Convert radius from km to miles (MongoDB uses miles)
  const radiusInMiles = radius / 1.609;

  // Find violations within radius
  const violations = await Violation.find({
    'location.coordinates': {
      $geoWithin: {
        $centerSphere: [
          [parseFloat(longitude), parseFloat(latitude)],
          radiusInMiles / 3963.2 // Earth's radius in miles
        ]
      }
    }
  });

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
  const violation = await Violation.findById(req.params.id)
    .populate([
      { path: 'created_by', select: 'name' },
      { path: 'updated_by', select: 'name' }
    ]);

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
  const violationData = req.body;

  // Process geocoding if needed
  if (violationData.location && violationData.location.name) {
    // Only geocode if coordinates aren't provided or need to be updated
    const shouldGeocode = !violationData.location.coordinates || 
                        (violationData.location.coordinates[0] === 0 && 
                        violationData.location.coordinates[1] === 0);

    if (shouldGeocode) {
      try {
        const geoData = await geocodeLocation(
          violationData.location.name,
          violationData.location.administrative_division || ''
        );

        if (geoData && geoData.length > 0) {
          violationData.location.coordinates = [
            geoData[0].longitude,
            geoData[0].latitude
          ];
        }
      } catch (err) {
        // If geocoding fails, continue with user-provided coordinates or fail gracefully
        console.error('Geocoding failed:', err);
      }
    }
  }

  // Add user to violation data
  violationData.created_by = req.user.id;
  violationData.updated_by = req.user.id;

  // Create the violation
  const violation = await Violation.create(violationData);

  res.status(201).json({
    success: true,
    data: violation
  });
});

/**
 * @desc    Update violation
 * @route   PUT /api/violations/:id
 * @access  Private (Editors and Admins)
 */
exports.updateViolation = asyncHandler(async (req, res, next) => {
  let violation = await Violation.findById(req.params.id);

  if (!violation) {
    return next(
      new ErrorResponse(`Violation not found with id of ${req.params.id}`, 404)
    );
  }

  const violationData = req.body;

  // Process geocoding if the location was updated
  if (violationData.location && violationData.location.name) {
    const locationChanged = 
      violation.location.name !== violationData.location.name ||
      violation.location.administrative_division !== violationData.location.administrative_division;

    // Only geocode if the location changed and new coordinates aren't provided
    if (locationChanged && !violationData.location.coordinates) {
      try {
        const geoData = await geocodeLocation(
          violationData.location.name,
          violationData.location.administrative_division || ''
        );

        if (geoData && geoData.length > 0) {
          violationData.location.coordinates = [
            geoData[0].longitude,
            geoData[0].latitude
          ];
        }
      } catch (err) {
        // If geocoding fails, keep original coordinates
        violationData.location.coordinates = violation.location.coordinates;
      }
    }
  }

  // Add updated_by field
  violationData.updated_by = req.user.id;

  // Update the violation
  violation = await Violation.findByIdAndUpdate(req.params.id, violationData, {
    new: true,
    runValidators: true
  });

  res.status(200).json({
    success: true,
    data: violation
  });
});

/**
 * @desc    Delete violation
 * @route   DELETE /api/violations/:id
 * @access  Private (Admin only)
 */
exports.deleteViolation = asyncHandler(async (req, res, next) => {
  const violation = await Violation.findById(req.params.id);

  if (!violation) {
    return next(
      new ErrorResponse(`Violation not found with id of ${req.params.id}`, 404)
    );
  }

  await violation.remove();

  res.status(200).json({
    success: true,
    data: {}
  });
});

/**
 * @desc    Get violation statistics
 * @route   GET /api/violations/stats
 * @access  Public
 */
exports.getViolationStats = asyncHandler(async (req, res, next) => {
  // Count by type
  const typeStats = await Violation.aggregate([
    {
      $group: {
        _id: '$type',
        count: { $sum: 1 }
      }
    },
    {
      $sort: { count: -1 }
    }
  ]);

  // Count by administrative division
  const locationStats = await Violation.aggregate([
    {
      $group: {
        _id: '$location.administrative_division',
        count: { $sum: 1 }
      }
    },
    {
      $sort: { count: -1 }
    }
  ]);

  // Count by time periods (yearly)
  const timeStats = await Violation.aggregate([
    {
      $project: {
        year: { $year: { $toDate: '$date' } }
      }
    },
    {
      $group: {
        _id: '$year',
        count: { $sum: 1 }
      }
    },
    {
      $sort: { _id: 1 }
    }
  ]);

  // Get total casualties
  const casualties = await Violation.aggregate([
    {
      $group: {
        _id: null,
        total: { $sum: '$casualties' }
      }
    }
  ]);

  // Total violations
  const totalViolations = await Violation.countDocuments();

  res.status(200).json({
    success: true,
    data: {
      totalViolations,
      totalCasualties: casualties.length > 0 ? casualties[0].total : 0,
      byType: typeStats,
      byLocation: locationStats,
      byYear: timeStats
    }
  });
});

/**
 * Build filter query based on request query parameters
 * @param {Object} queryParams - Request query parameters
 * @returns {Object} Mongoose query object
 */
const buildFilterQuery = (queryParams) => {
  const query = {};

  // Filter by type
  if (queryParams.type) {
    query.type = queryParams.type;
  }

  // Filter by date range
  if (queryParams.startDate || queryParams.endDate) {
    query.date = {};
    
    if (queryParams.startDate) {
      query.date.$gte = new Date(queryParams.startDate);
    }
    
    if (queryParams.endDate) {
      query.date.$lte = new Date(queryParams.endDate);
    }
  }

  // Filter by location name (case-insensitive)
  if (queryParams.location) {
    query['location.name'] = new RegExp(queryParams.location, 'i');
  }

  // Filter by administrative division
  if (queryParams.administrative_division) {
    query['location.administrative_division'] = new RegExp(queryParams.administrative_division, 'i');
  }

  // Filter by certainty level
  if (queryParams.certainty_level) {
    query.certainty_level = queryParams.certainty_level;
  }

  // Filter by verification status
  if (queryParams.verified !== undefined) {
    query.verified = queryParams.verified === 'true';
  }

  // Filter by perpetrator
  if (queryParams.perpetrator) {
    query.perpetrator = new RegExp(queryParams.perpetrator, 'i');
  }

  // Filter by perpetrator affiliation
  if (queryParams.perpetrator_affiliation) {
    query.perpetrator_affiliation = new RegExp(queryParams.perpetrator_affiliation, 'i');
  }

  // Filter by tags
  if (queryParams.tags) {
    const tags = queryParams.tags.split(',').map(tag => tag.trim());
    query.tags = { $in: tags };
  }

  // Geospatial query if coordinates and radius provided
  if (queryParams.latitude && queryParams.longitude && queryParams.radius) {
    const lat = parseFloat(queryParams.latitude);
    const lng = parseFloat(queryParams.longitude);
    const radiusInMiles = parseFloat(queryParams.radius) / 1.609; // Convert to miles
    
    query['location.coordinates'] = {
      $geoWithin: {
        $centerSphere: [
          [lng, lat],
          radiusInMiles / 3963.2 // Earth's radius in miles
        ]
      }
    };
  }

  return query;
};