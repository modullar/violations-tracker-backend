const Violation = require('../../models/Violation');
const { geocodeLocation } = require('../../utils/geocoder');
const { checkForDuplicates } = require('../../utils/duplicateChecker');
const { mergeWithExistingViolation } = require('./merge');
const logger = require('../../config/logger');
const ErrorResponse = require('../../utils/errorResponse');

/**
 * Geocode a location based on Arabic and English names
 * @param {Object} location - Location object with name and administrative_division
 * @returns {Promise<Array>} - Coordinates [longitude, latitude] or null if failed
 */
const geocodeLocationData = async (location) => {
  if (!location || !location.name) {
    throw new Error('Location name is required');
  }

  try {
    // Extract location names
    const locationNameAr = location.name.ar || '';
    const locationNameEn = location.name.en || '';
    const adminDivisionAr = location.administrative_division ? 
      (location.administrative_division.ar || '') : '';
    const adminDivisionEn = location.administrative_division ? 
      (location.administrative_division.en || '') : '';
    
    // Try Arabic first
    let geoDataAr = await geocodeLocation(locationNameAr, adminDivisionAr);
    
    // Try English
    let geoDataEn = await geocodeLocation(locationNameEn, adminDivisionEn);
    
    // Use the best result based on quality score
    let geoData;
    if (geoDataAr && geoDataAr.length > 0 && geoDataEn && geoDataEn.length > 0) {
      // If we have both results, pick the one with higher quality
      geoData = (geoDataAr[0].quality || 0) >= (geoDataEn[0].quality || 0) ? geoDataAr : geoDataEn;
      logger.info(`Using ${geoData === geoDataAr ? 'Arabic' : 'English'} result with quality ${geoData[0].quality || 0}`);
    } else {
      // Otherwise use whichever one succeeded
      geoData = (geoDataAr && geoDataAr.length > 0) ? geoDataAr : geoDataEn;
    }

    if (geoData && geoData.length > 0) {
      return [geoData[0].longitude, geoData[0].latitude];
    } else {
      throw new Error(
        `Could not find valid coordinates for location. Tried both Arabic (${locationNameAr}) and English (${locationNameEn}) names. Please verify the location names.`
      );
    }
  } catch (err) {
    throw new Error(`Geocoding failed: ${err.message}. Please verify the location names.`);
  }
};

/**
 * Process a single violation data (geocode and add user info)
 * @param {Object} violationData - Violation data
 * @param {String} userId - User ID creating the violation
 * @returns {Promise<Object>} - Processed violation data
 */
const processViolationData = async (violationData, userId) => {
  // Geocode location if provided
  if (violationData.location && violationData.location.name) {
    const coordinates = await geocodeLocationData(violationData.location);
    violationData.location.coordinates = coordinates;
  }

  // Add user information
  violationData.created_by = userId;
  violationData.updated_by = userId;

  return violationData;
};

/**
 * Create a single violation with duplicate checking
 * @param {Object} violationData - Violation data
 * @param {String} userId - User ID creating the violation
 * @param {Object} options - Creation options
 * @returns {Promise<Object>} - Created or merged violation
 */
const createSingleViolation = async (violationData, userId, options = {}) => {
  const { 
    checkDuplicates = true,
    mergeDuplicates = true,
    duplicateThreshold = 0.75 
  } = options;

  // 1. Validate and sanitize data using model validation
  const sanitizedData = await Violation.validateForCreation(violationData, { 
    requiresGeocoding: true 
  });

  // 2. Check for duplicates if enabled
  if (checkDuplicates) {
    const duplicateResult = await checkForDuplicates(sanitizedData, {
      similarityThreshold: duplicateThreshold,
      limit: 5
    });

    if (duplicateResult.hasDuplicates) {
      const bestMatch = duplicateResult.bestMatch;
      
      logger.info(`Found potential duplicate for violation`, {
        similarity: bestMatch.similarity,
        exactMatch: bestMatch.exactMatch,
        existingViolationId: bestMatch.violation._id
      });

      if (mergeDuplicates) {
        // Merge with existing violation
        const mergedViolation = await mergeWithExistingViolation(
          sanitizedData, 
          bestMatch.violation, 
          userId,
          { preferNew: true }
        );

        return {
          violation: mergedViolation,
          wasMerged: true,
          duplicateInfo: {
            similarity: bestMatch.similarity,
            exactMatch: bestMatch.exactMatch,
            originalId: bestMatch.violation._id
          }
        };
      } else {
        // Return duplicate information without merging
        throw new ErrorResponse(
          'Potential duplicate violation found. Please review before creating.',
          409,
          { 
            duplicates: duplicateResult.duplicates.map(d => ({
              id: d.violation._id,
              similarity: d.similarity,
              exactMatch: d.exactMatch,
              violation: d.violation
            }))
          }
        );
      }
    }
  }

  // 3. Process data (geocode and add user info)
  const processedData = await processViolationData(sanitizedData, userId);
  
  // 4. Create violation (schema validation happens here as final safety net)
  const violation = await Violation.create(processedData);

  return {
    violation,
    wasMerged: false
  };
};

/**
 * Create multiple violations in batch with duplicate checking
 * @param {Array} violationsData - Array of violation data
 * @param {String} userId - User ID creating the violations
 * @param {Object} options - Creation options
 * @returns {Promise<Object>} - Object with created violations and errors
 */
const createBatchViolations = async (violationsData, userId, options = {}) => {
  const { 
    checkDuplicates = true,
    mergeDuplicates = true,
    duplicateThreshold = 0.75 
  } = options;

  if (!Array.isArray(violationsData)) {
    throw new ErrorResponse('Request body must be an array of violations', 400);
  }

  if (violationsData.length === 0) {
    throw new ErrorResponse('At least one violation must be provided', 400);
  }

  // 1. Validate all violations using model validation
  const { valid, invalid } = await Violation.validateBatch(violationsData, { 
    requiresGeocoding: true 
  });

  if (valid.length === 0) {
    throw new ErrorResponse('All violations failed validation', 400, { errors: invalid });
  }

  // 2. Process valid violations with duplicate checking
  const processedResults = [];
  
  for (const data of valid) {
    const { _batchIndex, ...violationData } = data;
    try {
      const result = await createSingleViolation(violationData, userId, {
        checkDuplicates,
        mergeDuplicates,
        duplicateThreshold
      });
      
      processedResults.push({
        ...result,
        batchIndex: _batchIndex
      });
    } catch (err) {
      // Add to invalid list if processing fails
      invalid.push({
        index: _batchIndex,
        violation: violationData,
        errors: [err.message]
      });
    }
  }

  if (processedResults.length === 0) {
    throw new ErrorResponse('All violations failed processing', 400, { errors: invalid });
  }

  // Separate created vs merged violations
  const created = processedResults.filter(r => !r.wasMerged).map(r => r.violation);
  const merged = processedResults.filter(r => r.wasMerged);

  return {
    violations: processedResults.map(r => r.violation),
    created: created,
    merged: merged.map(r => ({
      violation: r.violation,
      duplicateInfo: r.duplicateInfo
    })),
    errors: invalid.length > 0 ? invalid : undefined
  };
};

module.exports = {
  createSingleViolation,
  createBatchViolations,
  geocodeLocationData
};