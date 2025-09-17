const Violation = require('../models/Violation');
const stringSimilarity = require('string-similarity');

// Configuration
const SIMILARITY_THRESHOLD = 0.75;
const MAX_DISTANCE_METERS = 100;
const COMPARISON_DATE_TOLERANCE = 12 * 60 * 60 * 1000; // 12 hours in milliseconds

/**
 * Calculate distance between two points using Haversine formula
 * @param {number} lat1 - Latitude of first point
 * @param {number} lon1 - Longitude of first point
 * @param {number} lat2 - Latitude of second point
 * @param {number} lon2 - Longitude of second point
 * @returns {number} Distance in meters
 */
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3; // Earth's radius in meters
  const φ1 = lat1 * Math.PI/180;
  const φ2 = lat2 * Math.PI/180;
  const Δφ = (lat2-lat1) * Math.PI/180;
  const Δλ = (lon2-lon1) * Math.PI/180;

  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
          Math.cos(φ1) * Math.cos(φ2) *
          Math.sin(Δλ/2) * Math.sin(Δλ/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

  return R * c;
}

/**
 * Compare dates by converting to ISO string and comparing only the date part
 * @param {Date|string} date1 - First date
 * @param {Date|string} date2 - Second date
 * @returns {boolean} Whether dates are the same
 */
function compareDates(date1, date2) {
  const d1 = new Date(date1).toISOString().split('T')[0];
  const d2 = new Date(date2).toISOString().split('T')[0];
  return d1 === d2;
}

/**
 * Check if two violations are duplicates
 * @param {Object} newViolation - New violation to check
 * @param {Object} existingViolation - Existing violation from database
 * @returns {Object} Duplicate match information
 */
function checkViolationsMatch(newViolation, existingViolation) {
  // Check if they match on key fields
  const sameType = newViolation.type === existingViolation.type;
  const sameDate = compareDates(newViolation.date, existingViolation.date);
  const samePerpetrator = newViolation.perpetrator_affiliation === existingViolation.perpetrator_affiliation;
  
  // Check if coordinates are within specified distance
  let distance = Infinity;
  let nearbyLocation = false;
  if (newViolation.location?.coordinates && existingViolation.location?.coordinates) {
    const [lon1, lat1] = newViolation.location.coordinates;
    const [lon2, lat2] = existingViolation.location.coordinates;
    distance = calculateDistance(lat1, lon1, lat2, lon2);
    nearbyLocation = distance <= MAX_DISTANCE_METERS;
  }

  // Check casualties match (comparing all count fields)
  const casualtyFields = ['casualties', 'kidnapped_count', 'detained_count', 'injured_count', 'displaced_count'];
  const exactCasualtyMatch = casualtyFields.every(field => 
    (newViolation[field] || 0) === (existingViolation[field] || 0)
  );
  
  // Only apply flexible casualty matching if other key criteria match
  const keyFieldsMatch = sameType && sameDate && samePerpetrator && nearbyLocation;
  let sameCasualties = exactCasualtyMatch;
  
  if (!exactCasualtyMatch && keyFieldsMatch) {
    // Also check if total affected people count is similar (within 20% tolerance)
    const getTotalAffected = (violation) => casualtyFields.reduce((total, field) => total + (violation[field] || 0), 0);
    const total1 = getTotalAffected(newViolation);
    const total2 = getTotalAffected(existingViolation);
    const totalDifference = Math.abs(total1 - total2);
    const maxTotal = Math.max(total1, total2);
    const similarCasualtyCount = maxTotal === 0 ? true : (totalDifference / maxTotal) <= 0.2; // 20% tolerance
    
    sameCasualties = similarCasualtyCount;
  }
  
  // Calculate description similarity
  const enText1 = newViolation.description?.en || '';
  const enText2 = existingViolation.description?.en || '';
  const arText1 = newViolation.description?.ar || '';
  const arText2 = existingViolation.description?.ar || '';
  
  let enSimilarity = 0;
  let arSimilarity = 0;
  
  // Only calculate similarity if both texts are non-empty
  if (enText1.trim() && enText2.trim()) {
    enSimilarity = stringSimilarity.compareTwoStrings(enText1, enText2);
  }
  
  if (arText1.trim() && arText2.trim()) {
    arSimilarity = stringSimilarity.compareTwoStrings(arText1, arText2);
  }
  
  // Use the higher similarity score between English and Arabic
  const similarity = Math.max(enSimilarity, arSimilarity);

  // Determine if it's an exact match or high similarity match
  const exactMatch = sameType && sameDate && samePerpetrator && nearbyLocation && sameCasualties;
  
  // Use different similarity thresholds for different languages
  const hasArabicContent = (newViolation.description?.ar && existingViolation.description?.ar);
  const effectiveThreshold = hasArabicContent ? SIMILARITY_THRESHOLD * 0.8 : SIMILARITY_THRESHOLD; // Lower threshold for Arabic
  const highSimilarity = similarity >= effectiveThreshold;
  
  const isDuplicate = exactMatch || highSimilarity;

  return {
    isDuplicate,
    similarity,
    exactMatch,
    matchDetails: {
      sameType,
      sameDate,
      samePerpetrator,
      distance,
      nearbyLocation,
      sameCasualties,
      similarity
    }
  };
}

/**
 * Find potential duplicates for a new violation
 * @param {Object} newViolationData - New violation data to check
 * @param {Object} options - Options for duplicate checking
 * @returns {Promise<Array>} Array of potential duplicates with match details
 */
async function findPotentialDuplicates(newViolationData, options = {}) {
  const { limit = 5 } = options;

  try {
    // Build query conditions for 12-hour window
    const violationDate = new Date(newViolationData.date);
    const query = {
      type: newViolationData.type,
      date: {
        $gte: new Date(violationDate.getTime() - COMPARISON_DATE_TOLERANCE),
        $lte: new Date(violationDate.getTime() + COMPARISON_DATE_TOLERANCE)
      }
    };

    // Find potential candidates
    const candidates = await Violation.find(query)
      .limit(limit * 2) // Get more candidates to filter through
      .lean();

    const potentialDuplicates = [];

    for (const candidate of candidates) {
      const matchResult = checkViolationsMatch(newViolationData, candidate);
      
      if (matchResult.isDuplicate) {
        potentialDuplicates.push({
          violation: candidate,
          ...matchResult
        });
      }
    }

    // Sort by similarity score (highest first)
    potentialDuplicates.sort((a, b) => b.similarity - a.similarity);

    return potentialDuplicates.slice(0, limit);
  } catch (error) {
    throw new Error(`Error finding potential duplicates: ${error.message}`);
  }
}

/**
 * Check if a violation is a duplicate of existing ones
 * @param {Object} violationData - Violation data to check
 * @param {Object} options - Options for duplicate checking
 * @returns {Promise<Object>} Result with duplicate information
 */
async function checkForDuplicates(violationData, options = {}) {
  const potentialDuplicates = await findPotentialDuplicates(violationData, options);
  
  return {
    hasDuplicates: potentialDuplicates.length > 0,
    duplicates: potentialDuplicates,
    bestMatch: potentialDuplicates.length > 0 ? potentialDuplicates[0] : null
  };
}

module.exports = {
  checkForDuplicates,
  findPotentialDuplicates,
  checkViolationsMatch,
  calculateDistance,
  compareDates,
  SIMILARITY_THRESHOLD,
  MAX_DISTANCE_METERS,
  // Export with names expected by tests
  DEFAULT_SIMILARITY_THRESHOLD: SIMILARITY_THRESHOLD,
  DEFAULT_MAX_DISTANCE: MAX_DISTANCE_METERS
}; 