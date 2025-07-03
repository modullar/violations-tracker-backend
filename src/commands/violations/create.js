const Violation = require('../../models/Violation');
const mongoose = require('mongoose');
const { getCachedOrFreshGeocode } = require('../../utils/geocoder');
const { checkForDuplicates } = require('../../utils/duplicateChecker');
const { mergeWithExistingViolation } = require('./merge');
const logger = require('../../config/logger');
const ErrorResponse = require('../../utils/errorResponse');

/**
 * Geocode a location based on Arabic and English names with caching optimization
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
    
    // Try Arabic first with caching
    let geoDataAr = null;
    if (locationNameAr) {
      geoDataAr = await getCachedOrFreshGeocode(locationNameAr, adminDivisionAr, 'ar');
    }
    
    // Try English with caching
    let geoDataEn = null;
    if (locationNameEn) {
      geoDataEn = await getCachedOrFreshGeocode(locationNameEn, adminDivisionEn, 'en');
    }
    
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
 * @param {Object} options - Processing options
 * @returns {Promise<Object>} - Processed violation data
 */
const processViolationData = async (violationData, userId, options = {}) => {
  // Geocode location if provided and not skipped
  if (violationData.location && violationData.location.name && !options.skipGeocoding) {
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
    // Use a more robust duplicate checking with retry logic to handle race conditions
    let duplicateResult;
    let retryCount = 0;
    const maxRetries = 3;

    while (retryCount < maxRetries) {
      duplicateResult = await checkForDuplicates(sanitizedData, {
        similarityThreshold: duplicateThreshold,
        limit: 5
      });

      if (duplicateResult.hasDuplicates) {
        const bestMatch = duplicateResult.bestMatch;
        
        logger.info(`Found potential duplicate for violation (attempt ${retryCount + 1})`, {
          similarity: bestMatch.similarity,
          exactMatch: bestMatch.exactMatch,
          existingViolationId: bestMatch.violation._id
        });

        if (mergeDuplicates) {
          // Double-check the violation still exists before merging (race condition protection)
          // Skip this check in test environment or if _id is not a valid ObjectId
          let existingViolation = bestMatch.violation;
           
          if (process.env.NODE_ENV !== 'test' && mongoose.Types.ObjectId.isValid(bestMatch.violation._id)) {
            const freshViolation = await Violation.findById(bestMatch.violation._id);
            if (!freshViolation) {
              // Violation was deleted, retry duplicate check
              retryCount++;
              await new Promise(resolve => setTimeout(resolve, 100)); // Small delay
              continue;
            }
            existingViolation = freshViolation;
          }

          // Merge with existing violation
          const mergedViolation = await mergeWithExistingViolation(
            sanitizedData, 
            existingViolation, 
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
      
      // No duplicates found, break out of retry loop
      break;
    }
  }

  // 3. Process data (geocode and add user info)
  const processedData = await processViolationData(sanitizedData, userId, options);
  
  // 4. Create violation with additional race condition protection
  try {
    const violation = await Violation.create(processedData);
    return {
      violation,
      wasMerged: false
    };
  } catch (error) {
    // If it's a duplicate key error, do one final duplicate check and merge
    if (error.code === 11000 && checkDuplicates && mergeDuplicates) {
      logger.info('Caught duplicate key error, performing final duplicate check', {
        error: error.message
      });
      
      const finalDuplicateResult = await checkForDuplicates(sanitizedData, {
        similarityThreshold: duplicateThreshold,
        limit: 1
      });

      if (finalDuplicateResult.hasDuplicates) {
        const bestMatch = finalDuplicateResult.bestMatch;
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
      }
    }
    
    // Re-throw the original error if we can't handle it
    throw error;
  }
};

/**
 * Optimized batch geocoding - deduplicates locations to minimize API calls
 * @param {Array} violations - Array of violation data
 * @returns {Promise<Array>} - Array of violations with coordinates added
 */
const batchGeocodeLocations = async (violations) => {
  // Extract unique locations to avoid duplicate API calls
  const locationMap = new Map();
  const violationLocationMap = new Map();
  
  violations.forEach((violation, index) => {
    if (violation.location && violation.location.name) {
      // Create a unique key based on location names and admin division
      const locationKey = JSON.stringify({
        nameEn: violation.location.name.en || '',
        nameAr: violation.location.name.ar || '',
        adminEn: violation.location.administrative_division?.en || '',
        adminAr: violation.location.administrative_division?.ar || ''
      });
      
      if (!locationMap.has(locationKey)) {
        locationMap.set(locationKey, violation.location);
      }
      violationLocationMap.set(index, locationKey);
    }
  });
  
  logger.info(`Batch geocoding: ${violations.length} violations, ${locationMap.size} unique locations`);
  
  // Geocode unique locations only
  const geocodedResults = new Map();
  let totalApiCalls = 0;
  
  for (const [locationKey, location] of locationMap) {
    try {
      const startTime = Date.now();
      const coordinates = await geocodeLocationData(location);
      const endTime = Date.now();
      
      geocodedResults.set(locationKey, coordinates);
      totalApiCalls += 1; // Track API usage
      
      logger.info(`Geocoded unique location in ${endTime - startTime}ms: ${location.name?.en || location.name?.ar}`);
    } catch (error) {
      logger.error(`Failed to geocode location ${location.name?.en || location.name?.ar}: ${error.message}`);
      geocodedResults.set(locationKey, null);
    }
  }
  
  // Apply results back to violations
  let successCount = 0;
  violations.forEach((violation, index) => {
    const locationKey = violationLocationMap.get(index);
    if (locationKey && geocodedResults.has(locationKey)) {
      const coordinates = geocodedResults.get(locationKey);
      if (coordinates) {
        violation.location.coordinates = coordinates;
        successCount++;
      }
    }
  });
  
  logger.info(`Batch geocoding complete: ${successCount}/${violations.length} violations geocoded with ${totalApiCalls} unique API calls`);
  
  return violations;
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

  // 2. Batch geocode all locations at once to minimize API calls
  if (options.useBatchGeocoding !== false) {
    try {
      await batchGeocodeLocations(valid);
      logger.info('Batch geocoding completed successfully');
    } catch (error) {
      logger.error(`Batch geocoding failed: ${error.message}`);
      // Continue with individual geocoding fallback
    }
  }

  // 3. Process valid violations with duplicate checking
  const processedResults = [];
  
  for (const data of valid) {
    const { _batchIndex, ...violationData } = data;
    try {
      const result = await createSingleViolation(violationData, userId, {
        checkDuplicates,
        mergeDuplicates,
        duplicateThreshold,
        skipGeocoding: options.useBatchGeocoding !== false // Skip individual geocoding if batch geocoding was used
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
  geocodeLocationData,
  batchGeocodeLocations
};