const Violation = require('../../models/Violation');
const { geocodeLocation } = require('../../utils/geocoder');
const logger = require('../../config/logger');
const ErrorResponse = require('../../utils/errorResponse');
const DuplicateDetectionService = require('../../services/duplicateDetection');

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
 * Create a single violation
 * @param {Object} violationData - Violation data
 * @param {String} userId - User ID creating the violation
 * @returns {Promise<Object>} - Created violation or merged duplicate with duplicate info
 */
const createSingleViolation = async (violationData, userId) => {
  // Geocode location if provided
  if (violationData.location && violationData.location.name) {
    const coordinates = await geocodeLocationData(violationData.location);
    violationData.location.coordinates = coordinates;
  }

  // Add user information
  violationData.created_by = userId;
  violationData.updated_by = userId;

  // Check for duplicates
  const duplicateResult = await DuplicateDetectionService.processViolationWithDuplicateCheck(violationData);
  
  if (duplicateResult.isDuplicate) {
    // Duplicate found and merged
    logger.info(`Violation merged with existing duplicate. Updated violation ID: ${duplicateResult.violation._id}`);
    return {
      violation: duplicateResult.violation,
      isDuplicate: true,
      duplicates: duplicateResult.duplicates
    };
  }

  // No duplicates found, create new violation
  const newViolation = await Violation.create(violationData);
  return {
    violation: newViolation,
    isDuplicate: false,
    duplicates: []
  };
};

/**
 * Create multiple violations in batch
 * @param {Array} violationsData - Array of violation data
 * @param {String} userId - User ID creating the violations
 * @returns {Promise<Object>} - Object with created violations and errors
 */
const createBatchViolations = async (violationsData, userId) => {
  if (!Array.isArray(violationsData)) {
    throw new ErrorResponse('Request body must be an array of violations', 400);
  }

  if (violationsData.length === 0) {
    throw new ErrorResponse('At least one violation must be provided', 400);
  }

  const errors = [];
  const processedViolations = await Promise.all(
    violationsData.map(async (violationData, index) => {
      try {
        if (violationData.location && violationData.location.name) {
          logger.info(`Attempting to geocode location: ${violationData.location.name.ar || violationData.location.name.en}`);
          
          const coordinates = await geocodeLocationData(violationData.location);
          violationData.location.coordinates = coordinates;
          
          logger.info(`Successfully geocoded to coordinates: [${coordinates[0]}, ${coordinates[1]}]`);
        } else {
          errors.push({
            index,
            error: 'Location name is required'
          });
          return null;
        }

        // Add user information
        violationData.created_by = userId;
        violationData.updated_by = userId;

        return violationData;
      } catch (err) {
        errors.push({
          index,
          error: err.message
        });
        return null;
      }
    })
  );

  // Filter out failed violations
  const validViolations = processedViolations.filter(v => v !== null);

  if (validViolations.length === 0) {
    throw new ErrorResponse('All violations failed validation', 400, { errors });
  }

  // Create all valid violations in a single operation
  const violations = await Violation.create(validViolations);

  return {
    violations,
    errors: errors.length > 0 ? errors : undefined
  };
};

module.exports = {
  createSingleViolation,
  createBatchViolations,
  geocodeLocationData
};