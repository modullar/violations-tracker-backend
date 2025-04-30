const Violation = require('../models/Violation');
const ErrorResponse = require('../utils/errorResponse');
const asyncHandler = require('../utils/asyncHandler');
const { geocodeLocation } = require('../utils/geocoder');
const logger = require('../config/logger');

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
  // Get the violation
  const violationQuery = Violation.findById(req.params.id);
  
  // Try to populate if the method exists (for production)
  const violation = violationQuery.populate ? 
    await violationQuery.populate([
      { path: 'created_by', select: 'name' },
      { path: 'updated_by', select: 'name' }
    ]) : 
    await violationQuery;

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
    try {
      // Use English location name for geocoding
      const locationName = violationData.location.name.en || '';
      const adminDivision = violationData.location.administrative_division ? 
                           (violationData.location.administrative_division.en || '') : '';
      
      const geoData = await geocodeLocation(
        locationName,
        adminDivision
      );

      if (geoData && geoData.length > 0) {
        violationData.location.coordinates = [
          geoData[0].longitude,
          geoData[0].latitude
        ];
      } else {
        // If geocoding fails, set default coordinates
        violationData.location.coordinates = [0, 0];
        logger.warn(`No geocoding results found for: ${locationName}`);
      }
    } catch (err) {
      // If geocoding fails, set default coordinates
      violationData.location.coordinates = [0, 0];
      logger.error('Geocoding failed:', err);
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

  const violationData = { ...req.body };

  // Process geocoding if the location was updated
  if (violationData.location && violationData.location.name) {
    const locationChanged = 
      // Check if English or Arabic location names have changed
      (violation.location.name.en !== violationData.location.name.en || 
       violation.location.name.ar !== violationData.location.name.ar) ||
      // Check if administrative division has changed
      (violation.location.administrative_division && violationData.location.administrative_division &&
       (violation.location.administrative_division.en !== violationData.location.administrative_division.en ||
        violation.location.administrative_division.ar !== violationData.location.administrative_division.ar));

    // Only geocode if the location changed and new coordinates aren't provided
    if (locationChanged && (!violationData.location.coordinates || 
        (violationData.location.coordinates[0] === 0 && 
         violationData.location.coordinates[1] === 0))) {
      try {
        // Use English name for geocoding
        const locationName = violationData.location.name.en || '';
        const adminDivision = violationData.location.administrative_division ? 
                             (violationData.location.administrative_division.en || '') : '';
        
        const geoData = await geocodeLocation(
          locationName,
          adminDivision
        );

        if (geoData && geoData.length > 0) {
          violationData.location.coordinates = [
            geoData[0].longitude,
            geoData[0].latitude
          ];
        } else {
          // If geocoding returns no results, keep original coordinates
          violationData.location.coordinates = violation.location.coordinates || [0, 0];
        }
      } catch (err) {
        // If geocoding fails, keep original coordinates or default to [0, 0]
        violationData.location.coordinates = violation.location.coordinates || [0, 0];
        logger.error('Geocoding failed:', err);
      }
    }
  }

  // Add updated_by field
  violationData.updated_by = req.user.id;

  // Update the violation
  const updatedViolation = await Violation.findByIdAndUpdate(
    req.params.id,
    violationData,
    {
      new: true,
      runValidators: true
    }
  );

  if (!updatedViolation) {
    return next(
      new ErrorResponse(`Violation not found with id of ${req.params.id}`, 404)
    );
  }

  res.status(200).json({
    success: true,
    data: updatedViolation
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

  await Violation.findByIdAndDelete(req.params.id);

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
    // Set language for search
    const langField = queryParams.lang === 'ar' ? 'location.name.ar' : 'location.name.en';
    query[langField] = new RegExp(queryParams.location, 'i');
  }

  // Filter by administrative division
  if (queryParams.administrative_division) {
    // Set language for search
    const langField = queryParams.lang === 'ar' ? 'location.administrative_division.ar' : 'location.administrative_division.en';
    query[langField] = new RegExp(queryParams.administrative_division, 'i');
  }

  // Filter by certainty level
  if (queryParams.certainty_level) {
    query.certainty_level = queryParams.certainty_level;
  }

  // Filter by verification status
  if (queryParams.verified !== undefined) {
    query.verified = queryParams.verified === 'true';
  }

  // Filter by perpetrator (in the specified language)
  if (queryParams.perpetrator) {
    const langField = queryParams.lang === 'ar' ? 'perpetrator.ar' : 'perpetrator.en';
    query[langField] = new RegExp(queryParams.perpetrator, 'i');
  }

  // Filter by perpetrator affiliation
  if (queryParams.perpetrator_affiliation) {
    query.perpetrator_affiliation = queryParams.perpetrator_affiliation;
  }

  // Filter by description
  if (queryParams.description) {
    const langField = queryParams.lang === 'ar' ? 'description.ar' : 'description.en';
    query[langField] = new RegExp(queryParams.description, 'i');
  }

  // Filter by tags
  if (queryParams.tags) {
    const tags = queryParams.tags.split(',').map(tag => tag.trim());
    const langField = queryParams.lang === 'ar' ? 'ar' : 'en';
    
    // Create query to match tags in the specified language
    query.tags = {
      $elemMatch: {
        [langField]: { $in: tags.map(tag => new RegExp(tag, 'i')) }
      }
    };
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

/**
 * @desc    Get violations by type
 * @route   GET /api/violations/stats/type
 * @access  Private (Admin)
 */
exports.getViolationsByType = asyncHandler(async (req, res, next) => {
  const stats = await Violation.aggregate([
    {
      $group: {
        _id: '$type',
        count: { $sum: 1 }
      }
    }
  ]);

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
  const stats = await Violation.aggregate([
    {
      $group: {
        _id: '$location.administrative_division',
        count: { $sum: 1 }
      }
    }
  ]);

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
  const stats = await Violation.aggregate([
    {
      $project: {
        year: { $year: '$date' }
      }
    },
    {
      $group: {
        _id: '$year',
        count: { $sum: 1 }
      }
    }
  ]);

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
  const total = await Violation.countDocuments();

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
  const violationsData = req.body;
  
  if (!Array.isArray(violationsData)) {
    return next(new ErrorResponse('Request body must be an array of violations', 400));
  }

  if (violationsData.length === 0) {
    return next(new ErrorResponse('At least one violation must be provided', 400));
  }

  // Process each violation
  const processedViolations = await Promise.all(
    violationsData.map(async (violationData) => {
      // Process geocoding if needed
      if (violationData.location && violationData.location.name) {
        try {
          // Use English location name for geocoding
          const locationName = violationData.location.name.en || '';
          const adminDivision = violationData.location.administrative_division ? 
                               (violationData.location.administrative_division.en || '') : '';
          
          logger.info(`Attempting to geocode location: ${locationName}, ${adminDivision}`);
          
          const geoData = await geocodeLocation(
            locationName,
            adminDivision
          );

          if (geoData && geoData.length > 0) {
            violationData.location.coordinates = [
              geoData[0].longitude,
              geoData[0].latitude
            ];
            logger.info(`Successfully geocoded to coordinates: [${geoData[0].longitude}, ${geoData[0].latitude}]`);
          } else {
            // If geocoding fails, set default coordinates
            violationData.location.coordinates = [0, 0];
            logger.warn(`No geocoding results found for: ${locationName}`);
          }
        } catch (err) {
          // If geocoding fails, set default coordinates
          violationData.location.coordinates = [0, 0];
          logger.error(`Geocoding failed for location "${violationData.location.name.en}": ${err.message}`);
          logger.error('Full error:', err);
        }
      }

      // Add user to violation data
      violationData.created_by = req.user.id;
      violationData.updated_by = req.user.id;

      return violationData;
    })
  );

  // Create all violations in a single operation
  const violations = await Violation.create(processedViolations);

  res.status(201).json({
    success: true,
    count: violations.length,
    data: violations
  });
});