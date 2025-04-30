const Violation = require('../models/Violation');
const ErrorResponse = require('../utils/errorResponse');
const asyncHandler = require('../utils/asyncHandler');
const { geocodeLocation } = require('../utils/geocoder');
const logger = require('../config/logger');
const anthropicService = require('../services/anthropicService');
const violationParsingPrompt = require('../prompts/violationParsingPrompt');
const duplicateDetectionPrompt = require('../prompts/duplicateDetectionPrompt');

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
    // Only geocode if coordinates aren't provided or need to be updated
    const shouldGeocode = !violationData.location.coordinates || 
                        (violationData.location.coordinates[0] === 0 && 
                        violationData.location.coordinates[1] === 0);

    if (shouldGeocode) {
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
        }
      } catch (err) {
        // If geocoding fails, continue with user-provided coordinates or fail gracefully
        logger.error('Geocoding failed:', err);
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
 * @desc    Parse a violation report using Claude LLM and store in database
 * @route   POST /api/violations/parse
 * @access  Private (Editors and Admins)
 */
exports.parseViolationReport = asyncHandler(async (req, res, next) => {
  const { text, language = 'en', detectDuplicates = true, updateExisting = true, preview = false } = req.body;

  if (!text || text.trim().length < 50) {
    return next(new ErrorResponse('Report text is too short or missing', 400));
  }

  // Parse the report using Claude LLM
  try {
    logger.info('Parsing violation report using Claude API');
    const parsedViolations = await anthropicService.parseViolationReport(text, language, violationParsingPrompt);
    
    // If parsed result is not an array, wrap it in an array
    const violationsArray = Array.isArray(parsedViolations) ? parsedViolations : [parsedViolations];
    
    // If preview mode is enabled, return the parsed violations without saving
    if (preview) {
      return res.status(200).json({
        success: true,
        count: violationsArray.length,
        data: violationsArray,
        preview: true
      });
    }

    // Process each violation for storage
    const processedViolations = await Promise.all(
      violationsArray.map(async (violationData) => {
        let finalViolationData = { ...violationData };
        let existingViolation = null;
        let updateAction = false;
        
        // Handle duplicate detection if enabled
        if (detectDuplicates) {
          // Find potential duplicates based on date, location, and type
          const potentialDuplicates = await findPotentialDuplicates(violationData);
          
          if (potentialDuplicates.length > 0) {
            // Analyze if any of the potential duplicates are actual duplicates
            const duplicateAnalysis = await anthropicService.detectDuplicates(
              violationData, 
              potentialDuplicates, 
              duplicateDetectionPrompt
            );
            
            // If duplicate found and we're allowed to update existing records
            if (duplicateAnalysis.isDuplicate && duplicateAnalysis.confidence > 0.7 && updateExisting) {
              existingViolation = potentialDuplicates.find(v => 
                v._id.toString() === duplicateAnalysis.duplicateId || 
                v._id.toString() === potentialDuplicates[0]._id.toString()
              );
              
              if (existingViolation) {
                // Handle complementary data merging
                if (duplicateAnalysis.relationshipType === 'complementary') {
                  finalViolationData = mergeViolationData(existingViolation, violationData, duplicateAnalysis.mergeStrategy);
                  updateAction = true;
                } else if (duplicateAnalysis.relationshipType === 'identical') {
                  // If identical duplicate, skip adding a new record
                  return { 
                    violationData: existingViolation, 
                    action: 'skipped', 
                    existingId: existingViolation._id 
                  };
                }
              }
            }
          }
        }

        // Process geocoding if needed
        if (finalViolationData.location && finalViolationData.location.name) {
          // Only geocode if coordinates aren't provided or need to be updated
          const shouldGeocode = !finalViolationData.location.coordinates || 
                              (finalViolationData.location.coordinates[0] === 0 && 
                               finalViolationData.location.coordinates[1] === 0);

          if (shouldGeocode) {
            try {
              // Use English location name for geocoding
              const locationName = finalViolationData.location.name.en || '';
              const adminDivision = finalViolationData.location.administrative_division ? 
                                    (finalViolationData.location.administrative_division.en || '') : '';
              
              const geoData = await geocodeLocation(
                locationName,
                adminDivision
              );

              if (geoData && geoData.length > 0) {
                finalViolationData.location.coordinates = [
                  geoData[0].longitude,
                  geoData[0].latitude
                ];
              }
            } catch (err) {
              // If geocoding fails, continue with user-provided coordinates or fail gracefully
              logger.error('Geocoding failed during violation parsing:', err);
            }
          }
        }

        // Add user to violation data
        finalViolationData.created_by = req.user.id;
        finalViolationData.updated_by = req.user.id;

        if (updateAction && existingViolation) {
          return { 
            violationData: finalViolationData, 
            action: 'update', 
            existingId: existingViolation._id 
          };
        } else {
          return { 
            violationData: finalViolationData, 
            action: 'create' 
          };
        }
      })
    );

    // Separate violations by action
    const toCreate = processedViolations.filter(v => v.action === 'create').map(v => v.violationData);
    const toUpdate = processedViolations.filter(v => v.action === 'update');
    const skipped = processedViolations.filter(v => v.action === 'skipped');

    // Perform database operations
    const createdViolations = toCreate.length > 0 ? await Violation.create(toCreate) : [];
    
    const updatedViolations = await Promise.all(
      toUpdate.map(async ({ violationData, existingId }) => {
        return await Violation.findByIdAndUpdate(
          existingId,
          violationData,
          { new: true, runValidators: true }
        );
      })
    );

    // Combine results
    const result = [
      ...createdViolations, 
      ...updatedViolations, 
      ...skipped.map(s => s.violationData)
    ];

    const summary = {
      total: result.length,
      created: createdViolations.length,
      updated: updatedViolations.length,
      skipped: skipped.length
    };

    res.status(201).json({
      success: true,
      summary,
      data: result
    });
  } catch (error) {
    logger.error('Error in violation parsing endpoint:', error);
    return next(new ErrorResponse(`Error parsing violation report: ${error.message}`, 500));
  }
});

/**
 * Find potential duplicate violations in the database
 * @param {Object} violationData - The violation data to check for duplicates
 * @returns {Promise<Array>} - Array of potential duplicate violations
 */
const findPotentialDuplicates = async (violationData) => {
  // Extract date with a 3-day buffer
  const date = new Date(violationData.date);
  const startDate = new Date(date);
  startDate.setDate(date.getDate() - 3);
  const endDate = new Date(date);
  endDate.setDate(date.getDate() + 3);

  // Build query for potential duplicates
  const query = {
    // Date range match (within 3 days)
    date: {
      $gte: startDate,
      $lte: endDate
    },
    // Same violation type
    type: violationData.type
  };

  // Add location match if available (name-based)
  if (violationData.location && violationData.location.name) {
    if (violationData.location.name.en) {
      query['location.name.en'] = new RegExp(violationData.location.name.en, 'i');
    } else if (violationData.location.name.ar) {
      query['location.name.ar'] = new RegExp(violationData.location.name.ar, 'i');
    }
  }

  // Find potential duplicates
  return Violation.find(query).limit(5);
};

/**
 * Merge data from a new violation into an existing one
 * @param {Object} existing - The existing violation record
 * @param {Object} newData - The new violation data
 * @param {Object} mergeStrategy - Strategy for merging specific fields
 * @returns {Object} - Merged violation data
 */
const mergeViolationData = (existing, newData, mergeStrategy = {}) => {
  // Convert Mongoose document to plain object if needed
  const existingData = existing.toObject ? existing.toObject() : existing;
  const result = { ...existingData };
  
  const fieldsToMerge = mergeStrategy?.fieldsToMerge || [
    'description', 'source', 'source_url', 'media_links', 
    'victims', 'casualties', 'tags'
  ];
  
  // Simple merge for most fields
  fieldsToMerge.forEach(field => {
    if (newData[field]) {
      switch (field) {
        case 'description':
          // For localized fields, merge content if longer/more detailed
          if (newData.description.en && (!result.description.en || newData.description.en.length > result.description.en.length)) {
            result.description.en = newData.description.en;
          }
          if (newData.description.ar && (!result.description.ar || newData.description.ar.length > result.description.ar.length)) {
            result.description.ar = newData.description.ar;
          }
          break;
          
        case 'casualties':
          // Take the highest casualty count
          if (newData.casualties > result.casualties) {
            result.casualties = newData.casualties;
          }
          break;
          
        case 'victims':
          // Merge victim arrays, avoiding duplicates
          if (Array.isArray(newData.victims) && newData.victims.length > 0) {
            // If we have a proper victim merge strategy, we could be more sophisticated
            // For now, just add new victims that aren't duplicates
            const existingVictims = result.victims || [];
            newData.victims.forEach(newVictim => {
              const isDuplicate = existingVictims.some(existing => 
                existing.age === newVictim.age && 
                existing.gender === newVictim.gender &&
                existing.status === newVictim.status
              );
              
              if (!isDuplicate) {
                existingVictims.push(newVictim);
              }
            });
            result.victims = existingVictims;
          }
          break;
          
        case 'tags':
          // Combine tags, avoiding duplicates
          if (Array.isArray(newData.tags) && newData.tags.length > 0) {
            const existingTags = result.tags || [];
            
            newData.tags.forEach(newTag => {
              const isDuplicate = existingTags.some(existing => 
                existing.en === newTag.en || existing.ar === newTag.ar
              );
              
              if (!isDuplicate) {
                existingTags.push(newTag);
              }
            });
            
            result.tags = existingTags;
          }
          break;
          
        case 'media_links':
          // Combine media links, avoiding duplicates
          if (Array.isArray(newData.media_links) && newData.media_links.length > 0) {
            const existingLinks = result.media_links || [];
            const newLinks = newData.media_links.filter(link => !existingLinks.includes(link));
            result.media_links = [...existingLinks, ...newLinks];
          }
          break;
          
        default:
          // For other fields, use new data if it exists
          if (newData[field] && (
              !result[field] || 
              (typeof newData[field] === 'string' && newData[field].length > result[field].length)
          )) {
            result[field] = newData[field];
          }
      }
    }
  });
  
  // Always update the updater
  result.updated_by = newData.updated_by || result.updated_by;
  
  return result;
};

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
        // Only geocode if coordinates aren't provided or need to be updated
        const shouldGeocode = !violationData.location.coordinates || 
                          (violationData.location.coordinates[0] === 0 && 
                          violationData.location.coordinates[1] === 0);

        if (shouldGeocode) {
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
              logger.warn(`No geocoding results found for: ${locationName}`);
            }
          } catch (err) {
            // If geocoding fails, log detailed error
            logger.error(`Geocoding failed for location "${violationData.location.name.en}": ${err.message}`);
            logger.error('Full error:', err);
          }
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