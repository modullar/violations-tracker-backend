/**
 * Violations Commands
 * 
 * This module exports all violation-related commands for database operations.
 * These commands encapsulate business logic and can be used by controllers,
 * queue workers, CLI tools, or any other part of the application.
 */

// Create operations
const { createSingleViolation, createBatchViolations, geocodeLocationData, batchGeocodeLocations } = require('./create');

// Update operations
const { updateViolation, hasLocationChanged } = require('./update');

// Delete operations
const { deleteViolation } = require('./delete');

// Query operations
const { 
  buildFilterQuery, 
  getViolations, 
  getViolationsInRadius, 
  getViolationById 
} = require('./query');

// Statistics operations
const { 
  getViolationStats, 
  getViolationsByType, 
  getViolationsByLocation, 
  getViolationsByYear, 
  getViolationsTotal 
} = require('./stats');

// Merge operations
const { 
  mergeViolations, 
  mergeWithExistingViolation, 
  mergeVictims, 
  mergeMediaLinks, 
  mergeTags, 
  mergeLocalizedString 
} = require('./merge');

module.exports = {
  // Create
  createSingleViolation,
  createBatchViolations,
  geocodeLocationData,
  batchGeocodeLocations,
  
  // Update
  updateViolation,
  hasLocationChanged,
  
  // Delete
  deleteViolation,
  
  // Query
  buildFilterQuery,
  getViolations,
  getViolationsInRadius,
  getViolationById,
  
  // Stats
  getViolationStats,
  getViolationsByType,
  getViolationsByLocation,
  getViolationsByYear,
  getViolationsTotal,
  
  // Merge
  mergeViolations,
  mergeWithExistingViolation,
  mergeVictims,
  mergeMediaLinks,
  mergeTags,
  mergeLocalizedString
};