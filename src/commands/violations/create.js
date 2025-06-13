const Violation = require('../../models/Violation');
const { geocodeLocation } = require('../../utils/geocoder');
const logger = require('../../config/logger');
const ErrorResponse = require('../../utils/errorResponse');
const { 
  findPotentialDuplicates, 
  mergeSourceUrls, 
  mergeMediaLinks, 
  mergeTags, 
  mergeVictims 
} = require('../../utils/duplicateDetection');

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
 * @param {String} action - Action to take if duplicates found ('merge' or 'create')
 * @returns {Promise<Object>} - Created/updated violation with duplicate information
 */
const createSingleViolation = async (violationData, userId, action = 'create') => {
  // Geocode location if provided
  if (violationData.location && violationData.location.name) {
    const coordinates = await geocodeLocationData(violationData.location);
    violationData.location.coordinates = coordinates;
  }

  // Add user information
  violationData.created_by = userId;
  violationData.updated_by = userId;

  // Check for duplicates
  const duplicates = await findPotentialDuplicates(violationData);
  
  if (duplicates.length > 0 && action === 'merge') {
    // Merge with the most similar duplicate
    const bestMatch = duplicates[0].existingViolation;
    
    logger.info(`Found ${duplicates.length} potential duplicates. Merging with violation ${bestMatch._id}`);
    
    // Merge data from new violation into existing one
    const mergedData = {
      ...bestMatch,
      ...violationData,
      // Merge arrays
      source_urls: mergeSourceUrls(bestMatch.source_urls, violationData.source_urls),
      media_links: mergeMediaLinks(bestMatch.media_links, violationData.media_links),
      tags: mergeTags(bestMatch.tags, violationData.tags),
      victims: mergeVictims(bestMatch.victims, violationData.victims),
      // Keep verification status if new data is more verified
      verified: violationData.verified || bestMatch.verified,
      // Update timestamps
      updated_by: userId,
      updatedAt: new Date()
    };

    // Update the existing violation
    const updatedViolation = await Violation.findByIdAndUpdate(
      bestMatch._id,
      mergedData,
      { new: true, runValidators: true }
    );

    return {
      violation: updatedViolation,
      duplicates: duplicates.map(d => ({
        id: d.existingViolation._id,
        matchDetails: d.matchDetails
      })),
      action: 'merged'
    };
  }

  // Create new violation (either no duplicates found or action is 'create')
  const newViolation = await Violation.create(violationData);
  
  return {
    violation: newViolation,
    duplicates: duplicates.map(d => ({
      id: d.existingViolation._id,
      matchDetails: d.matchDetails
    })),
    action: 'created'
  };
};

/**
 * Create multiple violations in batch
 * @param {Array} violationsData - Array of violation data
 * @param {String} userId - User ID creating the violations
 * @param {String} action - Action to take if duplicates found ('merge' or 'create')
 * @returns {Promise<Object>} - Object with created violations, errors, and duplicate information
 */
const createBatchViolations = async (violationsData, userId, action = 'create') => {
  if (!Array.isArray(violationsData)) {
    throw new ErrorResponse('Request body must be an array of violations', 400);
  }

  if (violationsData.length === 0) {
    throw new ErrorResponse('At least one violation must be provided', 400);
  }

  const errors = [];
  const results = [];
  
  // Process each violation individually to handle duplicates properly
  for (let index = 0; index < violationsData.length; index++) {
    const violationData = violationsData[index];
    
    try {
      if (violationData.location && violationData.location.name) {
        logger.info(`Processing violation ${index + 1}/${violationsData.length}: ${violationData.location.name.ar || violationData.location.name.en}`);
        
        const coordinates = await geocodeLocationData(violationData.location);
        violationData.location.coordinates = coordinates;
        
        logger.info(`Successfully geocoded to coordinates: [${coordinates[0]}, ${coordinates[1]}]`);
      } else {
        errors.push({
          index,
          error: 'Location name is required'
        });
        continue;
      }

      // Add user information
      violationData.created_by = userId;
      violationData.updated_by = userId;

      // Check for duplicates and create/merge
      const duplicates = await findPotentialDuplicates(violationData);
      
      if (duplicates.length > 0 && action === 'merge') {
        // Merge with the most similar duplicate
        const bestMatch = duplicates[0].existingViolation;
        
        logger.info(`Found ${duplicates.length} potential duplicates for violation ${index + 1}. Merging with violation ${bestMatch._id}`);
        
        // Merge data from new violation into existing one
        const mergedData = {
          ...bestMatch,
          ...violationData,
          // Merge arrays
          source_urls: mergeSourceUrls(bestMatch.source_urls, violationData.source_urls),
          media_links: mergeMediaLinks(bestMatch.media_links, violationData.media_links),
          tags: mergeTags(bestMatch.tags, violationData.tags),
          victims: mergeVictims(bestMatch.victims, violationData.victims),
          // Keep verification status if new data is more verified
          verified: violationData.verified || bestMatch.verified,
          // Update timestamps
          updated_by: userId,
          updatedAt: new Date()
        };

        // Update the existing violation
        const updatedViolation = await Violation.findByIdAndUpdate(
          bestMatch._id,
          mergedData,
          { new: true, runValidators: true }
        );

        results.push({
          violation: updatedViolation,
          duplicates: duplicates.map(d => ({
            id: d.existingViolation._id,
            matchDetails: d.matchDetails
          })),
          action: 'merged',
          index
        });
      } else {
        // Create new violation
        const newViolation = await Violation.create(violationData);
        
        results.push({
          violation: newViolation,
          duplicates: duplicates.map(d => ({
            id: d.existingViolation._id,
            matchDetails: d.matchDetails
          })),
          action: 'created',
          index
        });
      }
    } catch (err) {
      errors.push({
        index,
        error: err.message
      });
    }
  }

  if (results.length === 0) {
    throw new ErrorResponse('All violations failed validation', 400, { errors });
  }

  return {
    violations: results.map(r => r.violation),
    results: results, // Include full results with duplicate information
    errors: errors.length > 0 ? errors : undefined
  };
};

module.exports = {
  createSingleViolation,
  createBatchViolations,
  geocodeLocationData
};