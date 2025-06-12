const Violation = require('../../models/Violation');
const { geocodeLocationData } = require('./create');
const ErrorResponse = require('../../utils/errorResponse');
const logger = require('../../config/logger');

/**
 * Check if location has changed by comparing nested objects
 * @param {Object} newLocation - New location data
 * @param {Object} existingLocation - Existing location data
 * @returns {Boolean} - True if location changed
 */
const hasLocationChanged = (newLocation, existingLocation) => {
  if (!newLocation) return false;
  
  // Deep comparison of location objects
  const nameChanged = JSON.stringify(newLocation.name) !== JSON.stringify(existingLocation.name);
  const adminDivisionChanged = JSON.stringify(newLocation.administrative_division) !== 
    JSON.stringify(existingLocation.administrative_division);
  
  return nameChanged || adminDivisionChanged;
};

/**
 * Update a violation by ID
 * @param {String} violationId - Violation ID
 * @param {Object} updateData - Data to update
 * @param {String} userId - User ID performing the update
 * @returns {Promise<Object>} - Updated violation
 */
const updateViolation = async (violationId, updateData, userId) => {
  // Find the existing violation
  const existingViolation = await Violation.findById(violationId);
  
  if (!existingViolation) {
    throw new ErrorResponse(`Violation not found with id of ${violationId}`, 404);
  }

  // Check if location needs geocoding
  if (updateData.location && hasLocationChanged(updateData.location, existingViolation.location)) {
    try {
      const coordinates = await geocodeLocationData(updateData.location);
      updateData.location.coordinates = coordinates;
      logger.info(`Location updated and geocoded for violation ${violationId}`);
    } catch (error) {
      throw new ErrorResponse(error.message, 400);
    }
  }

  // Add updated_by field
  updateData.updated_by = userId;

  // Update the violation
  const updatedViolation = await Violation.findByIdAndUpdate(
    violationId,
    updateData,
    {
      new: true,
      runValidators: true
    }
  );

  if (!updatedViolation) {
    throw new ErrorResponse(`Violation not found with id of ${violationId}`, 404);
  }

  return updatedViolation;
};

module.exports = {
  updateViolation,
  hasLocationChanged
};