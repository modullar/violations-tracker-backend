const stringSimilarity = require('string-similarity');
const Violation = require('../models/Violation');
const logger = require('../config/logger');

class DuplicateDetectionService {
  /**
   * Calculate distance between two points using Haversine formula
   * @param {number} lat1 - Latitude of first point
   * @param {number} lon1 - Longitude of first point
   * @param {number} lat2 - Latitude of second point
   * @param {number} lon2 - Longitude of second point
   * @returns {number} Distance in meters
   */
  static calculateDistance(lat1, lon1, lat2, lon2) {
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
   * @returns {boolean} True if dates are the same
   */
  static compareDates(date1, date2) {
    const d1 = new Date(date1).toISOString().split('T')[0];
    const d2 = new Date(date2).toISOString().split('T')[0];
    return d1 === d2;
  }

  /**
   * Find potential duplicate violations for a given violation data
   * @param {Object} violationData - The violation data to check for duplicates
   * @returns {Promise<Array>} Array of potential duplicates with similarity scores
   */
  static async findDuplicates(violationData) {
    try {
      // First, find violations with matching basic criteria
      const potentialDuplicates = await Violation.find({
        type: violationData.type,
        perpetrator_affiliation: violationData.perpetrator_affiliation
      }).lean();

      const duplicates = [];
      
      for (const existingViolation of potentialDuplicates) {
        // Check if dates match
        const sameDate = this.compareDates(violationData.date, existingViolation.date);
        if (!sameDate) continue;

        // Check location proximity
        let distance = Infinity;
        let nearbyLocation = false;
        if (violationData.location?.coordinates && existingViolation.location?.coordinates) {
          const [lon1, lat1] = violationData.location.coordinates;
          const [lon2, lat2] = existingViolation.location.coordinates;
          distance = this.calculateDistance(lat1, lon1, lat2, lon2);
          nearbyLocation = distance <= DuplicateDetectionService.MAX_DISTANCE_METERS;
        }

        // Check casualties match
        const sameCasualties = JSON.stringify(violationData.casualties) === 
                             JSON.stringify(existingViolation.casualties);

        // Calculate description similarity
        let similarity = 0;
        if (violationData.description?.en && existingViolation.description?.en) {
          similarity = stringSimilarity.compareTwoStrings(
            violationData.description.en,
            existingViolation.description.en
          );
        }

        // Determine if this is a duplicate based on criteria
        const isExactMatch = nearbyLocation && sameCasualties;
        const isSimilarDescription = similarity >= DuplicateDetectionService.SIMILARITY_THRESHOLD;

        if (isExactMatch || isSimilarDescription) {
          duplicates.push({
            existingViolation,
            similarity,
            exactMatch: isExactMatch,
            matchDetails: {
              sameDate: true,
              nearbyLocation,
              sameCasualties,
              distance: nearbyLocation ? distance : null,
              descriptionSimilarity: similarity
            }
          });
        }
      }

      // Sort by similarity score (highest first)
      duplicates.sort((a, b) => b.similarity - a.similarity);

      logger.info(`Found ${duplicates.length} potential duplicates for violation`);
      return duplicates;

    } catch (error) {
      logger.error('Error finding duplicates:', error);
      throw error;
    }
  }

  /**
   * Merge violation data intelligently
   * @param {Object} existingViolation - The existing violation document
   * @param {Object} newViolation - The new violation data
   * @returns {Object} Merged violation data
   */
  static mergeViolationData(existingViolation, newViolation) {
    const merged = { ...existingViolation };

    // 1. Merge Media Links
    if (newViolation.media_links && newViolation.media_links.length > 0) {
      const existingMediaLinks = new Set(existingViolation.media_links || []);
      const newMediaLinks = newViolation.media_links.filter(link => !existingMediaLinks.has(link));
      merged.media_links = [...(existingViolation.media_links || []), ...newMediaLinks];
    }

    // 2. Merge Victims
    if (newViolation.victims && newViolation.victims.length > 0) {
      const existingVictims = existingViolation.victims || [];
      const existingVictimIds = new Set(existingVictims.map(v => v._id?.toString()));
      const newVictims = newViolation.victims.filter(v => 
        !v._id || !existingVictimIds.has(v._id.toString())
      );
      merged.victims = [...existingVictims, ...newVictims];
    }

    // 3. Merge Tags
    if (newViolation.tags && newViolation.tags.length > 0) {
      const existingTags = existingViolation.tags || [];
      const existingTagsEn = new Set(existingTags.map(t => t.en));
      const newTags = newViolation.tags.filter(t => !existingTagsEn.has(t.en));
      merged.tags = [...existingTags, ...newTags];
    }

    // 4. Merge Source Information
    if (newViolation.source) {
      if (!merged.source || !merged.source.en) {
        merged.source = newViolation.source;
      } else if (merged.source.en !== newViolation.source.en) {
        // If sources are different, combine them
        merged.source = {
          en: `${merged.source.en}, ${newViolation.source.en}`,
          ar: merged.source.ar && newViolation.source.ar ? 
              `${merged.source.ar}, ${newViolation.source.ar}` : 
              (merged.source.ar || newViolation.source.ar || '')
        };
      }
    }

    // 5. Merge Source URLs
    if (newViolation.source_urls && newViolation.source_urls.length > 0) {
      const existingUrls = new Set(existingViolation.source_urls || []);
      const newUrls = newViolation.source_urls.filter(url => !existingUrls.has(url));
      merged.source_urls = [...(existingViolation.source_urls || []), ...newUrls];
    }

    // 6. Update Verification Status (only upgrade, never downgrade)
    if (newViolation.verified && !existingViolation.verified) {
      merged.verified = true;
      if (newViolation.verification_method) {
        merged.verification_method = newViolation.verification_method;
      }
    }

    // 7. Merge Casualties Information (take the higher number)
    if (newViolation.casualties !== undefined) {
      merged.casualties = Math.max(
        existingViolation.casualties || 0,
        newViolation.casualties || 0
      );
    }

    // 8. Merge Specific Counts (take the higher number)
    const countFields = ['kidnapped_count', 'detained_count', 'injured_count'];
    countFields.forEach(field => {
      if (newViolation[field] !== undefined) {
        merged[field] = Math.max(
          existingViolation[field] || 0,
          newViolation[field] || 0
        );
      }
    });

    // 9. Merge Description (keep the longer one)
    if (newViolation.description) {
      if (!merged.description) {
        merged.description = newViolation.description;
      } else {
        const existingLength = merged.description.en?.length || 0;
        const newLength = newViolation.description.en?.length || 0;
        if (newLength > existingLength) {
          merged.description = newViolation.description;
        }
      }
    }

    // 10. Update Last Modified Information
    merged.updated_at = new Date();
    merged.updated_by = newViolation.created_by;

    return merged;
  }

  /**
   * Process a new violation and handle duplicates
   * @param {Object} violationData - The new violation data
   * @returns {Promise<Object>} Result object with violation and duplicates info
   */
  static async processViolationWithDuplicateCheck(violationData) {
    try {
      // Find potential duplicates
      const duplicates = await this.findDuplicates(violationData);
      
      if (duplicates.length > 0) {
        // Get the best match (highest similarity)
        const bestMatch = duplicates[0];
        
        logger.info(`Found duplicate violation. Merging with existing violation ID: ${bestMatch.existingViolation._id}`);
        
        // Merge the data
        const mergedData = this.mergeViolationData(bestMatch.existingViolation, violationData);
        
        // Update the existing violation
        const updatedViolation = await Violation.findByIdAndUpdate(
          bestMatch.existingViolation._id,
          mergedData,
          { new: true, runValidators: true }
        );

        return {
          violation: updatedViolation,
          isDuplicate: true,
          duplicates: duplicates.map(d => ({
            id: d.existingViolation._id,
            similarity: d.similarity,
            exactMatch: d.exactMatch,
            matchDetails: d.matchDetails
          }))
        };
      }

      // No duplicates found, return null to indicate new violation should be created
      return {
        violation: null,
        isDuplicate: false,
        duplicates: []
      };

    } catch (error) {
      logger.error('Error processing violation with duplicate check:', error);
      throw error;
    }
  }
}

// Define constants as static properties
DuplicateDetectionService.SIMILARITY_THRESHOLD = 0.75;
DuplicateDetectionService.MAX_DISTANCE_METERS = 100;

module.exports = DuplicateDetectionService;