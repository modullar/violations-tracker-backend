const Violation = require('../../models/Violation');
const ErrorResponse = require('../../utils/errorResponse');

/**
 * Delete a violation by ID
 * @param {String} violationId - Violation ID to delete
 * @returns {Promise<Object>} - Deleted violation
 */
const deleteViolation = async (violationId) => {
  const violation = await Violation.findById(violationId);

  if (!violation) {
    throw new ErrorResponse(`Violation not found with id of ${violationId}`, 404);
  }

  await Violation.findByIdAndDelete(violationId);

  return violation;
};

module.exports = {
  deleteViolation
};