const TerritoryControl = require('../../models/TerritoryControl');

/**
 * Build filter query based on query parameters
 * @param {Object} queryParams - Request query parameters
 * @returns {Object} Mongoose query object
 */
const buildFilterQuery = (queryParams) => {
  const query = {};

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

  // Filter by specific date
  if (queryParams.date) {
    query.date = new Date(queryParams.date);
  }

  // Filter by controller
  if (queryParams.controlledBy) {
    query['features.properties.controlledBy'] = queryParams.controlledBy;
  }

  // Filter by territory name (case-insensitive)
  if (queryParams.territoryName) {
    query['features.properties.name'] = new RegExp(queryParams.territoryName, 'i');
  }

  // Filter by source
  if (queryParams.source) {
    query['metadata.source'] = queryParams.source;
  }

  // Filter by accuracy level
  if (queryParams.accuracy) {
    query['metadata.accuracy'] = queryParams.accuracy;
  }

  // Filter by controlled since date range
  if (queryParams.controlledSinceStart || queryParams.controlledSinceEnd) {
    const controlledSinceQuery = {};
    
    if (queryParams.controlledSinceStart) {
      controlledSinceQuery.$gte = new Date(queryParams.controlledSinceStart);
    }
    
    if (queryParams.controlledSinceEnd) {
      controlledSinceQuery.$lte = new Date(queryParams.controlledSinceEnd);
    }
    
    query['features.properties.controlledSince'] = controlledSinceQuery;
  }

  // Search in description (supports both languages)
  if (queryParams.description) {
    const searchRegex = new RegExp(queryParams.description, 'i');
    query.$or = [
      { 'metadata.description.en': searchRegex },
      { 'metadata.description.ar': searchRegex }
    ];
  }

  return query;
};

/**
 * Get territory controls with filtering, sorting, and pagination
 * @param {Object} queryParams - Query parameters for filtering
 * @param {Object} paginationOptions - Pagination options
 * @returns {Promise<Object>} - Paginated results
 */
const getTerritoryControls = async (queryParams, paginationOptions = {}) => {
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
    ]
  };

  // Execute query with pagination
  const result = await TerritoryControl.paginate(query, options);

  return {
    territoryControls: result.docs,
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
 * Get territory control by ID
 * @param {String} id - Territory control ID
 * @returns {Promise<Object>} - Territory control document
 */
const getTerritoryControlById = async (id) => {
  const territoryControl = await TerritoryControl.findById(id)
    .populate('created_by', 'name')
    .populate('updated_by', 'name');

  return territoryControl;
};

/**
 * Get territory control for a specific date
 * @param {String|Date} targetDate - Target date
 * @param {Object} options - Query options
 * @returns {Promise<Object>} - Territory control document
 */
const getTerritoryControlByDate = async (targetDate, options = {}) => {
  return await TerritoryControl.findByDate(targetDate, options);
};

/**
 * Get closest territory control to a specific date
 * @param {String|Date} targetDate - Target date
 * @returns {Promise<Object>} - Territory control document
 */
const getClosestTerritoryControlToDate = async (targetDate) => {
  return await TerritoryControl.findClosestToDate(targetDate);
};

/**
 * Get all available dates that have territory control data
 * @returns {Promise<Array>} - Array of dates
 */
const getAvailableDates = async () => {
  return await TerritoryControl.getAvailableDates();
};

/**
 * Get territory control timeline with pagination
 * @param {Object} options - Query and pagination options
 * @returns {Promise<Object>} - Paginated timeline results
 */
const getTerritoryTimeline = async (options = {}) => {
  return await TerritoryControl.getTimeline(options);
};

/**
 * Search territory controls by text (in names, descriptions)
 * @param {String} searchText - Text to search for
 * @param {Object} options - Search options
 * @returns {Promise<Array>} - Matching territory controls
 */
const searchTerritoryControls = async (searchText, options = {}) => {
  const searchRegex = new RegExp(searchText, 'i');
  
  const query = {
    $or: [
      { 'features.properties.name': searchRegex },
      { 'metadata.description.en': searchRegex },
      { 'metadata.description.ar': searchRegex },
      { 'features.properties.description.en': searchRegex },
      { 'features.properties.description.ar': searchRegex }
    ]
  };

  // Add date filter if provided
  if (options.startDate || options.endDate) {
    query.date = {};
    if (options.startDate) query.date.$gte = new Date(options.startDate);
    if (options.endDate) query.date.$lte = new Date(options.endDate);
  }

  const territoryControls = await TerritoryControl.find(query)
    .populate('created_by', 'name')
    .populate('updated_by', 'name')
    .sort({ date: -1 })
    .limit(options.limit || 50);

  return territoryControls;
};

/**
 * Get territories controlled by a specific entity across all dates
 * @param {String} controlledBy - Controller identifier
 * @param {Object} options - Query options
 * @returns {Promise<Array>} - Territory controls with matching controller
 */
const getTerritoryControlsByController = async (controlledBy, options = {}) => {
  const query = {
    'features.properties.controlledBy': controlledBy
  };

  // Add date filter if provided
  if (options.startDate || options.endDate) {
    query.date = {};
    if (options.startDate) query.date.$gte = new Date(options.startDate);
    if (options.endDate) query.date.$lte = new Date(options.endDate);
  }

  const territoryControls = await TerritoryControl.find(query)
    .populate('created_by', 'name')
    .populate('updated_by', 'name')
    .sort({ date: -1 })
    .limit(options.limit || 100);

  return territoryControls;
};

/**
 * Get territory control changes between two dates
 * @param {String|Date} startDate - Start date
 * @param {String|Date} endDate - End date
 * @returns {Promise<Object>} - Changes analysis
 */
const getTerritoryControlChanges = async (startDate, endDate) => {
  const startControl = await getTerritoryControlByDate(startDate);
  const endControl = await getTerritoryControlByDate(endDate);

  if (!startControl || !endControl) {
    return {
      hasData: false,
      message: 'Insufficient data for comparison'
    };
  }

  // Analyze changes between the two territory controls
  const startControllers = new Set();
  const endControllers = new Set();
  
  startControl.features.forEach(f => startControllers.add(f.properties.controlledBy));
  endControl.features.forEach(f => endControllers.add(f.properties.controlledBy));

  const newControllers = Array.from(endControllers).filter(c => !startControllers.has(c));
  const lostControllers = Array.from(startControllers).filter(c => !endControllers.has(c));

  return {
    hasData: true,
    startDate: startControl.date,
    endDate: endControl.date,
    totalFeatures: {
      start: startControl.features.length,
      end: endControl.features.length,
      change: endControl.features.length - startControl.features.length
    },
    controllers: {
      start: Array.from(startControllers),
      end: Array.from(endControllers),
      new: newControllers,
      lost: lostControllers
    },
    startControl,
    endControl
  };
};

module.exports = {
  buildFilterQuery,
  getTerritoryControls,
  getTerritoryControlById,
  getTerritoryControlByDate,
  getClosestTerritoryControlToDate,
  getAvailableDates,
  getTerritoryTimeline,
  searchTerritoryControls,
  getTerritoryControlsByController,
  getTerritoryControlChanges
}; 