const Violation = require('../../models/Violation');
const logger = require('../../config/logger');

/**
 * Merge victims from source violation into target violation
 * @param {Array} targetVictims - Existing victims in target violation
 * @param {Array} sourceVictims - Victims from source violation
 * @returns {Array} Merged victims array
 */
function mergeVictims(targetVictims = [], sourceVictims = []) {
  if (!sourceVictims || sourceVictims.length === 0) {
    return targetVictims;
  }

  const merged = [...targetVictims];
  
  // Add unique victims based on key characteristics
  for (const sourceVictim of sourceVictims) {
    const isDuplicate = targetVictims.some(targetVictim => {
      return (
        targetVictim.age === sourceVictim.age &&
        targetVictim.gender === sourceVictim.gender &&
        targetVictim.status === sourceVictim.status &&
        targetVictim.group_affiliation?.en === sourceVictim.group_affiliation?.en &&
        targetVictim.sectarian_identity?.en === sourceVictim.sectarian_identity?.en
      );
    });

    if (!isDuplicate) {
      merged.push(sourceVictim);
    }
  }

  return merged;
}

/**
 * Merge media links from source into target
 * @param {Array} targetLinks - Existing media links
 * @param {Array} sourceLinks - Media links to merge
 * @returns {Array} Merged media links array
 */
function mergeMediaLinks(targetLinks = [], sourceLinks = []) {
  if (!sourceLinks || sourceLinks.length === 0) {
    return targetLinks;
  }

  const existingLinks = new Set(targetLinks);
  const newLinks = sourceLinks.filter(link => !existingLinks.has(link));
  
  return [...targetLinks, ...newLinks];
}

/**
 * Merge tags from source into target
 * @param {Array} targetTags - Existing tags
 * @param {Array} sourceTags - Tags to merge
 * @returns {Array} Merged tags array
 */
function mergeTags(targetTags = [], sourceTags = []) {
  if (!sourceTags || sourceTags.length === 0) {
    return targetTags;
  }

  const existingTagsEn = new Set(targetTags.map(t => t.en));
  const newTags = sourceTags.filter(t => !existingTagsEn.has(t.en));
  
  return [...targetTags, ...newTags];
}

/**
 * Merge localized string fields, preferring non-empty values
 * @param {Object} target - Target localized string object
 * @param {Object} source - Source localized string object
 * @returns {Object} Merged localized string
 */
function mergeLocalizedString(target = {}, source = {}) {
  return {
    en: target.en || source.en || '',
    ar: target.ar || source.ar || ''
  };
}

/**
 * Merge location data intelligently, preserving coordinates
 * @param {Object} existingLocation - Target location object (existing violation)
 * @param {Object} newLocation - Source location object (new violation data)
 * @returns {Object} Merged location object
 */
function mergeLocation(existingLocation = {}, newLocation = {}) {
  // Always preserve existing coordinates if they exist
  const merged = { ...existingLocation };
  
  // Only update name and administrative_division from new data
  if (newLocation && newLocation.name) {
    merged.name = mergeLocalizedString(existingLocation.name || {}, newLocation.name);
  }
  if (newLocation && newLocation.administrative_division) {
    merged.administrative_division = mergeLocalizedString(
      existingLocation.administrative_division || {}, 
      newLocation.administrative_division
    );
  }
  
  return merged;
}

/**
 * Update casualty counts to reflect merged data
 * @param {Object} mergedData - The merged violation data
 * @returns {Object} Updated casualty counts
 */
function updateCasualtyCounts(mergedData) {
  const updates = {};
  
  // Update casualties count based on victims with death dates
  if (mergedData.victims && mergedData.victims.length > 0) {
    const deadVictims = mergedData.victims.filter(v => v.death_date).length;
    if (deadVictims > (mergedData.casualties || 0)) {
      updates.casualties = deadVictims;
    }
  }

  return updates;
}

/**
 * Merge two violations, combining their data intelligently
 * @param {Object} newViolationData - New violation data
 * @param {Object} existingViolation - Existing violation from database
 * @param {Object} options - Merge options
 * @returns {Object} Merged violation data
 */
function mergeViolations(newViolationData, existingViolation, options = {}) {
  const { 
    preferNew = true, // Whether to prefer new data over existing
    updateTimestamp = true 
  } = options;

  const merged = { ...existingViolation };

  // Merge basic fields - prefer non-empty/non-default values
  if (preferNew) {
    // Prefer new data for most fields
    Object.keys(newViolationData).forEach(key => {
      if (newViolationData[key] !== null && newViolationData[key] !== undefined) {
        // Skip fields that have special handling below
        if (key !== 'certainty_level' && key !== 'location') {
          merged[key] = newViolationData[key];
        }
      }
    });
  }

  // Special handling for specific fields
  
  // Merge localized strings intelligently
  if (newViolationData.description || existingViolation.description) {
    merged.description = mergeLocalizedString(
      preferNew ? newViolationData.description : existingViolation.description,
      preferNew ? existingViolation.description : newViolationData.description
    );
  }

  if (newViolationData.source || existingViolation.source) {
    merged.source = mergeLocalizedString(
      existingViolation.source,
      newViolationData.source
    );
  }

  if (newViolationData.source_url || existingViolation.source_url) {
    merged.source_url = mergeLocalizedString(
      existingViolation.source_url,
      newViolationData.source_url
    );
  }

  if (newViolationData.verification_method || existingViolation.verification_method) {
    merged.verification_method = mergeLocalizedString(
      existingViolation.verification_method,
      newViolationData.verification_method
    );
  }

  // Merge location data intelligently, preserving coordinates
  merged.location = mergeLocation(existingViolation.location, newViolationData.location);

  // Merge arrays
  merged.victims = mergeVictims(existingViolation.victims, newViolationData.victims);
  merged.media_links = mergeMediaLinks(existingViolation.media_links, newViolationData.media_links);
  merged.tags = mergeTags(existingViolation.tags, newViolationData.tags);

  // Take the maximum of numeric counts
  const numericFields = ['casualties', 'kidnapped_count', 'detained_count', 'injured_count', 'displaced_count'];
  numericFields.forEach(field => {
    merged[field] = Math.max(
      newViolationData[field] || 0,
      existingViolation[field] || 0
    );
  });

  // Update casualty counts based on merged data
  const countUpdates = updateCasualtyCounts(merged);
  Object.assign(merged, countUpdates);

  // Prefer verified status
  if (newViolationData.verified || existingViolation.verified) {
    merged.verified = true;
  }

  // Use higher certainty level (always choose the higher one regardless of preferNew)
  const certaintyOrder = { 'possible': 1, 'probable': 2, 'confirmed': 3 };
  const newCertainty = certaintyOrder[newViolationData.certainty_level] || 1;
  const existingCertainty = certaintyOrder[existingViolation.certainty_level] || 1;
  
  if (newCertainty >= existingCertainty) {
    merged.certainty_level = newViolationData.certainty_level;
  } else {
    merged.certainty_level = existingViolation.certainty_level;
  }

  // Update timestamps if requested
  if (updateTimestamp) {
    merged.updatedAt = new Date();
  }

  return merged;
}

/**
 * Merge new violation data with existing violation in database
 * @param {Object} newViolationData - New violation data
 * @param {Object} existingViolation - Existing violation from database
 * @param {String} userId - User ID performing the merge
 * @param {Object} options - Merge options
 * @returns {Promise<Object>} Updated violation
 */
async function mergeWithExistingViolation(newViolationData, existingViolation, userId, options = {}) {
  try {
    // Merge the data
    const mergedData = mergeViolations(newViolationData, existingViolation, options);
    
    // Add user information
    mergedData.updated_by = userId;
    
    // Update the existing violation
    const updatedViolation = await Violation.findByIdAndUpdate(
      existingViolation._id,
      mergedData,
      { new: true, runValidators: true }
    );

    logger.info(`Merged violation data`, {
      violationId: existingViolation._id,
      userId,
      fieldsUpdated: Object.keys(mergedData).length
    });

    return updatedViolation;
  } catch (error) {
    logger.error(`Error merging violation data`, {
      violationId: existingViolation._id,
      userId,
      error: error.message
    });
    throw new Error(`Failed to merge violation: ${error.message}`);
  }
}

module.exports = {
  mergeViolations,
  mergeWithExistingViolation,
  mergeVictims,
  mergeMediaLinks,
  mergeTags,
  mergeLocalizedString,
  mergeLocation
}; 