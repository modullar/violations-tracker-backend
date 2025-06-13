const Violation = require('../../models/Violation');

/**
 * Get comprehensive violation statistics
 * @returns {Promise<Object>} - Statistics object
 */
const getViolationStats = async () => {
  // Count by type
  const typeStats = await Violation.aggregate([
    {
      $group: {
        _id: '$type',
        count: { $sum: 1 }
      }
    },
    {
      $sort: { count: -1 }
    }
  ]);

  // Count by administrative division
  const locationStats = await Violation.aggregate([
    {
      $group: {
        _id: '$location.administrative_division',
        count: { $sum: 1 }
      }
    },
    {
      $sort: { count: -1 }
    }
  ]);

  // Count by time periods (yearly)
  const timeStats = await Violation.aggregate([
    {
      $project: {
        year: { $year: { $toDate: '$date' } }
      }
    },
    {
      $group: {
        _id: '$year',
        count: { $sum: 1 }
      }
    },
    {
      $sort: { _id: 1 }
    }
  ]);

  // Get total casualties
  const casualties = await Violation.aggregate([
    {
      $group: {
        _id: null,
        total: { $sum: '$casualties' }
      }
    }
  ]);

  // Get total kidnapped
  const kidnapped = await Violation.aggregate([
    {
      $group: {
        _id: null,
        total: { $sum: '$kidnapped_count' }
      }
    }
  ]);

  // Get total injured
  const injured = await Violation.aggregate([
    {
      $group: {
        _id: null,
        total: { $sum: '$injured_count' }
      }
    }
  ]);

  // Get total displaced
  const displaced = await Violation.aggregate([
    {
      $group: {
        _id: null,
        total: { $sum: '$displaced_count' }
      }
    }
  ]);

  // Total violations
  const totalViolations = await Violation.countDocuments();

  return {
    totalViolations,
    totalCasualties: casualties.length > 0 ? casualties[0].total : 0,
    totalKidnapped: kidnapped.length > 0 ? kidnapped[0].total : 0,
    totalInjured: injured.length > 0 ? injured[0].total : 0,
    totalDisplaced: displaced.length > 0 ? displaced[0].total : 0,
    byType: typeStats,
    byLocation: locationStats,
    byYear: timeStats
  };
};

/**
 * Get violations grouped by type
 * @returns {Promise<Array>} - Array of type statistics
 */
const getViolationsByType = async () => {
  const stats = await Violation.aggregate([
    {
      $group: {
        _id: '$type',
        count: { $sum: 1 }
      }
    }
  ]);

  return stats;
};

/**
 * Get violations grouped by location
 * @returns {Promise<Array>} - Array of location statistics
 */
const getViolationsByLocation = async () => {
  const stats = await Violation.aggregate([
    {
      $group: {
        _id: '$location.administrative_division',
        count: { $sum: 1 }
      }
    }
  ]);

  return stats;
};

/**
 * Get yearly violation counts
 * @returns {Promise<Array>} - Array of yearly statistics
 */
const getViolationsByYear = async () => {
  const stats = await Violation.aggregate([
    {
      $project: {
        year: { $year: '$date' }
      }
    },
    {
      $group: {
        _id: '$year',
        count: { $sum: 1 }
      }
    }
  ]);

  return stats;
};

/**
 * Get total violation count
 * @returns {Promise<Number>} - Total count
 */
const getViolationsTotal = async () => {
  const total = await Violation.countDocuments();
  return total;
};

module.exports = {
  getViolationStats,
  getViolationsByType,
  getViolationsByLocation,
  getViolationsByYear,
  getViolationsTotal
};