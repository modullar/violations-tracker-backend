const Violation = require('../models/Violation');
const stringSimilarity = require('string-similarity');

// Configuration constants
const SIMILARITY_THRESHOLD = 0.75;
const MAX_DISTANCE_METERS = 100;

/**
 * Calculate distance between two points using Haversine formula
 * @param {Number} lat1 - Latitude of first point
 * @param {Number} lon1 - Longitude of first point
 * @param {Number} lat2 - Latitude of second point
 * @param {Number} lon2 - Longitude of second point
 * @returns {Number} - Distance in meters
 */
const calculateDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371e3; // Earth's radius in meters
  const φ1 = lat1 * Math.PI/180;
  const φ2 = lat2 * Math.PI/180;
  const Δφ = (lat2-lat1) * Math.PI/180;
  const Δλ = (lon2-lon1) * Math.PI/180;

  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
          Math.cos(φ1) * Math.cos(φ2) *
          Math.sin(Δλ/2) * Math.sin(Δλ/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

  return R * c; // Distance in meters
};

/**
 * Compare dates by converting to ISO string and comparing only the date part
 * @param {Date} date1 - First date
 * @param {Date} date2 - Second date
 * @returns {Boolean} - True if dates are the same
 */
const compareDates = (date1, date2) => {
  const d1 = new Date(date1).toISOString().split('T')[0];
  const d2 = new Date(date2).toISOString().split('T')[0];
  return d1 === d2;
};

/**
 * Check if two violations are duplicates
 * @param {Object} violation1 - First violation
 * @param {Object} violation2 - Second violation
 * @returns {Object} - Object with isDuplicate boolean and match details
 */
const isDuplicate = (violation1, violation2) => {
  // Check if they match on key fields
  const sameType = violation1.type === violation2.type;
  const sameDate = compareDates(violation1.date, violation2.date);
  const samePerpetrator = violation1.perpetrator_affiliation === violation2.perpetrator_affiliation;
  
  // Check if coordinates are within MAX_DISTANCE_METERS
  let distance = Infinity;
  let nearbyLocation = false;
  if (violation1.location?.coordinates && violation2.location?.coordinates) {
    const [lon1, lat1] = violation1.location.coordinates;
    const [lon2, lat2] = violation2.location.coordinates;
    distance = calculateDistance(lat1, lon1, lat2, lon2);
    nearbyLocation = distance <= MAX_DISTANCE_METERS;
  }

  // Check casualties match
  const sameCasualties = JSON.stringify(violation1.casualties) === JSON.stringify(violation2.casualties);
  
  // Calculate description similarity
  const similarity = stringSimilarity.compareTwoStrings(
    violation1.description?.en || '',
    violation2.description?.en || ''
  );

  const exactMatch = sameType && sameDate && samePerpetrator && nearbyLocation && sameCasualties;
  const similarityMatch = similarity >= SIMILARITY_THRESHOLD;

  return {
    isDuplicate: exactMatch || similarityMatch,
    matchDetails: {
      sameType,
      sameDate,
      samePerpetrator,
      distance,
      nearbyLocation,
      sameCasualties,
      similarity,
      exactMatch,
      similarityMatch
    }
  };
};

/**
 * Find potential duplicates for a given violation
 * @param {Object} violationData - Violation data to check for duplicates
 * @returns {Promise<Array>} - Array of potential duplicates with match details
 */
const findPotentialDuplicates = async (violationData) => {
  try {
    // Find violations with same type and date for initial filtering
    const potentialMatches = await Violation.find({
      type: violationData.type,
      date: {
        $gte: new Date(new Date(violationData.date).getTime() - 24 * 60 * 60 * 1000), // 1 day before
        $lte: new Date(new Date(violationData.date).getTime() + 24 * 60 * 60 * 1000)  // 1 day after
      }
    }).lean();

    const duplicates = [];
    
    for (const existingViolation of potentialMatches) {
      const duplicateCheck = isDuplicate(violationData, existingViolation);
      
      if (duplicateCheck.isDuplicate) {
        duplicates.push({
          existingViolation,
          matchDetails: duplicateCheck.matchDetails
        });
      }
    }

    // Sort by similarity score (highest first)
    duplicates.sort((a, b) => b.matchDetails.similarity - a.matchDetails.similarity);

    return duplicates;
  } catch (error) {
    console.error('Error finding potential duplicates:', error);
    return [];
  }
};

/**
 * Merge source URLs from two violations
 * @param {Array} existingUrls - Existing source URLs
 * @param {Array} newUrls - New source URLs to merge
 * @returns {Array} - Merged and deduplicated URLs
 */
const mergeSourceUrls = (existingUrls = [], newUrls = []) => {
  const allUrls = [...existingUrls, ...newUrls];
  return [...new Set(allUrls)].filter(url => url && url.trim() !== '');
};

/**
 * Merge media links from two violations
 * @param {Array} existingLinks - Existing media links
 * @param {Array} newLinks - New media links to merge
 * @returns {Array} - Merged and deduplicated media links
 */
const mergeMediaLinks = (existingLinks = [], newLinks = []) => {
  const allLinks = [...existingLinks, ...newLinks];
  return [...new Set(allLinks)].filter(link => link && link.trim() !== '');
};

/**
 * Merge tags from two violations
 * @param {Array} existingTags - Existing tags
 * @param {Array} newTags - New tags to merge
 * @returns {Array} - Merged and deduplicated tags
 */
const mergeTags = (existingTags = [], newTags = []) => {
  const existingTagsSet = new Set(existingTags.map(t => t.en));
  const mergedTags = [...existingTags];
  
  for (const newTag of newTags) {
    if (!existingTagsSet.has(newTag.en)) {
      mergedTags.push(newTag);
      existingTagsSet.add(newTag.en);
    }
  }
  
  return mergedTags;
};

/**
 * Merge victims from two violations
 * @param {Array} existingVictims - Existing victims
 * @param {Array} newVictims - New victims to merge
 * @returns {Array} - Merged victims (avoiding duplicates based on age, gender, status)
 */
const mergeVictims = (existingVictims = [], newVictims = []) => {
  const mergedVictims = [...existingVictims];
  
  for (const newVictim of newVictims) {
    const isDuplicateVictim = existingVictims.some(existing => 
      existing.age === newVictim.age &&
      existing.gender === newVictim.gender &&
      existing.status === newVictim.status
    );
    
    if (!isDuplicateVictim) {
      mergedVictims.push(newVictim);
    }
  }
  
  return mergedVictims;
};

module.exports = {
  findPotentialDuplicates,
  isDuplicate,
  calculateDistance,
  compareDates,
  mergeSourceUrls,
  mergeMediaLinks,
  mergeTags,
  mergeVictims,
  SIMILARITY_THRESHOLD,
  MAX_DISTANCE_METERS
};