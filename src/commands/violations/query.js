const Violation = require('../../models/Violation');

/**
 * Build filter query based on query parameters
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
 * Get violations with filtering, sorting, and pagination
 * @param {Object} queryParams - Query parameters for filtering
 * @param {Object} paginationOptions - Pagination options
 * @returns {Promise<Object>} - Paginated results
 */
const getViolations = async (queryParams, paginationOptions = {}) => {
  // Build query with filters
  const query = buildFilterQuery(queryParams);
  
  // Pagination options
  const options = {
    page: paginationOptions.page || 1,
    limit: paginationOptions.limit || 10,
    sort: paginationOptions.sort || '-date', // Default sort by date descending
    populate: [
      { path: 'created_by', select: 'name' },
      { path: 'updated_by', select: 'name' }
    ],
    select: '+perpetrator_affiliation'  // Explicitly include the field
  };

  // Execute query with pagination
  const result = await Violation.paginate(query, options);

  return {
    violations: result.docs,
    totalDocs: result.totalDocs,
    pagination: {
      page: result.page,
      limit: result.limit,
      totalPages: result.totalPages,
      totalResults: result.totalDocs,
      hasNextPage: result.hasNextPage,
      hasPrevPage: result.hasPrevPage,
      nextPage: result.nextPage,
      prevPage: result.prevPage
    }
  };
};

/**
 * Get violations within a specified radius
 * @param {Number} latitude - Center latitude
 * @param {Number} longitude - Center longitude
 * @param {Number} radius - Radius in kilometers
 * @returns {Promise<Array>} - Violations within radius
 */
const getViolationsInRadius = async (latitude, longitude, radius) => {
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

  return violations;
};

/**
 * Get a single violation by ID
 * @param {String} violationId - Violation ID
 * @returns {Promise<Object>} - Violation document
 */
const getViolationById = async (violationId) => {
  // Get the violation
  const violationQuery = Violation.findById(violationId);
  
  // Try to populate if the method exists (for production)
  const violation = violationQuery.populate ? 
    await violationQuery.populate([
      { path: 'created_by', select: 'name' },
      { path: 'updated_by', select: 'name' }
    ]) : 
    await violationQuery;

  return violation;
};

module.exports = {
  buildFilterQuery,
  getViolations,
  getViolationsInRadius,
  getViolationById
};