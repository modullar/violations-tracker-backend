const TerritoryControl = require('../../models/TerritoryControl');
const logger = require('../../config/logger');
const ErrorResponse = require('../../utils/errorResponse');

/**
 * Create a single territory control record
 * @param {Object} territoryData - Territory control data
 * @param {String} userId - User ID creating the record
 * @param {Object} options - Creation options
 * @returns {Promise<Object>} - Created territory control
 */
const createTerritoryControl = async (territoryData, userId, options = {}) => {
  const { 
    allowDuplicateDates = false
  } = options;

  // 1. Validate and sanitize data using model validation
  const sanitizedData = await TerritoryControl.validateForCreation(territoryData, { 
    allowDuplicateDates
  });

  // 2. Add user information
  sanitizedData.created_by = userId;
  sanitizedData.updated_by = userId;
  
  // 3. Create territory control record
  try {
    const territoryControl = await TerritoryControl.create(sanitizedData);
    
    logger.info('Territory control created successfully', {
      territoryControlId: territoryControl._id,
      date: territoryControl.date,
      featuresCount: territoryControl.features.length,
      createdBy: userId
    });
    
    return territoryControl;
  } catch (error) {
    logger.error('Failed to create territory control', {
      error: error.message,
      territoryData: {
        date: territoryData.date,
        featuresCount: territoryData.features?.length || 0
      },
      userId
    });
    
    // Handle specific MongoDB errors
    if (error.code === 11000) {
      throw new ErrorResponse(
        'Territory control data already exists for this date. Use update instead or set allowDuplicateDates option.',
        409
      );
    }
    
    throw error;
  }
};

/**
 * Create territory control from external data (e.g., from frontend territoryControl.ts)
 * @param {Object} territoryData - External territory control data
 * @param {String} userId - User ID creating the record
 * @param {Object} options - Creation options
 * @returns {Promise<Object>} - Created territory control
 */
const createTerritoryControlFromData = async (territoryData, userId, options = {}) => {
  // Convert external data format to our model format
  const convertedData = convertExternalData(territoryData);
  
  // Create the territory control
  return await createTerritoryControl(convertedData, userId, options);
};

/**
 * Convert external territory control data format to our model format
 * @param {Object} externalData - External territory control data (e.g., from frontend)
 * @returns {Object} - Converted data for our model
 */
const convertExternalData = (externalData) => {
  // If data is already in our format, return as-is
  if (externalData.type === 'FeatureCollection' && Array.isArray(externalData.features)) {
    return {
      type: externalData.type,
      date: externalData.date,
      features: externalData.features.map(feature => ({
        type: feature.type || 'Feature',
        properties: {
          name: feature.properties.name,
          controlledBy: feature.properties.controlledBy,
          color: feature.properties.color,
          controlledSince: feature.properties.controlledSince,
          description: feature.properties.description || { en: '', ar: '' }
        },
        geometry: feature.geometry
      })),
      metadata: externalData.metadata || {
        source: 'external_import',
        description: { en: '', ar: '' },
        accuracy: 'medium'
      }
    };
  }
  
  // Handle other formats if needed
  throw new ErrorResponse('Unsupported external data format', 400);
};

/**
 * Validate territory control data structure
 * @param {Object} territoryData - Territory control data to validate
 * @returns {Object} - Validation result
 */
const validateTerritoryControlData = (territoryData) => {
  const errors = [];
  
  // Check required fields
  if (!territoryData.type || territoryData.type !== 'FeatureCollection') {
    errors.push('Type must be "FeatureCollection"');
  }
  
  if (!territoryData.date) {
    errors.push('Date is required');
  }
  
  if (!territoryData.features || !Array.isArray(territoryData.features)) {
    errors.push('Features array is required');
  } else if (territoryData.features.length === 0) {
    errors.push('At least one feature is required');
  } else {
    // Validate each feature
    territoryData.features.forEach((feature, index) => {
      if (!feature.type || feature.type !== 'Feature') {
        errors.push(`Feature ${index + 1}: type must be "Feature"`);
      }
      
      if (!feature.properties) {
        errors.push(`Feature ${index + 1}: properties are required`);
      } else {
        if (!feature.properties.name) {
          errors.push(`Feature ${index + 1}: name is required`);
        }
        if (!feature.properties.controlledBy) {
          errors.push(`Feature ${index + 1}: controlledBy is required`);
        }
        if (!feature.properties.color) {
          errors.push(`Feature ${index + 1}: color is required`);
        }
        if (!feature.properties.controlledSince) {
          errors.push(`Feature ${index + 1}: controlledSince is required`);
        }
      }
      
      if (!feature.geometry) {
        errors.push(`Feature ${index + 1}: geometry is required`);
      } else {
        if (!feature.geometry.type || !['Polygon', 'MultiPolygon'].includes(feature.geometry.type)) {
          errors.push(`Feature ${index + 1}: geometry type must be "Polygon" or "MultiPolygon"`);
        }
        if (!feature.geometry.coordinates || !Array.isArray(feature.geometry.coordinates)) {
          errors.push(`Feature ${index + 1}: geometry coordinates are required`);
        }
      }
    });
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
};

/**
 * Create multiple territory control records in batch
 * @param {Array} territoryDataArray - Array of territory control data
 * @param {String} userId - User ID creating the records
 * @param {Object} options - Creation options
 * @returns {Promise<Object>} - Batch creation result
 */
const createBatchTerritoryControls = async (territoryDataArray, userId, options = {}) => {
  if (!Array.isArray(territoryDataArray)) {
    throw new ErrorResponse('Input must be an array of territory control data', 400);
  }

  if (territoryDataArray.length === 0) {
    throw new ErrorResponse('At least one territory control data must be provided', 400);
  }

  const results = {
    created: [],
    failed: [],
    total: territoryDataArray.length
  };

  // Process each territory control data
  for (let i = 0; i < territoryDataArray.length; i++) {
    const territoryData = territoryDataArray[i];
    
    try {
      const territoryControl = await createTerritoryControl(territoryData, userId, options);
      results.created.push({
        index: i,
        territoryControl,
        date: territoryControl.date
      });
    } catch (error) {
      results.failed.push({
        index: i,
        territoryData: {
          date: territoryData.date,
          featuresCount: territoryData.features?.length || 0
        },
        error: error.message
      });
    }
  }

  logger.info('Batch territory control creation completed', {
    total: results.total,
    created: results.created.length,
    failed: results.failed.length,
    userId
  });

  if (results.created.length === 0) {
    throw new ErrorResponse('All territory control creations failed', 400, { results });
  }

  return results;
};

module.exports = {
  createTerritoryControl,
  createTerritoryControlFromData,
  validateTerritoryControlData,
  createBatchTerritoryControls,
  convertExternalData
}; 