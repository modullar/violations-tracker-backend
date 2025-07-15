/**
 * Territory Control Commands
 * 
 * This module exports all territory control-related commands for database operations.
 * These commands encapsulate business logic and can be used by controllers,
 * queue workers, CLI tools, or any other part of the application.
 */

// Create operations
const { createTerritoryControl, createTerritoryControlFromData } = require('./create');

// Update operations
const { 
  updateTerritoryControl,
  addFeatureToTerritoryControl,
  removeFeatureFromTerritoryControl,
  updateTerritoryControlMetadata
} = require('./update');

// Delete operations
const { deleteTerritoryControl } = require('./delete');

// Query operations
const { 
  buildFilterQuery, 
  getTerritoryControls, 
  getTerritoryControlById,
  getTerritoryControlByDate,
  getClosestTerritoryControlToDate,
  getAvailableDates
} = require('./query');

// Statistics operations
const { 
  getTerritoryControlStats, 
  getControllerStats,
  getTerritoryTimeline,
  getControlChangesSummary
} = require('./stats');

module.exports = {
  // Create
  createTerritoryControl,
  createTerritoryControlFromData,
  
  // Update
  updateTerritoryControl,
  addFeatureToTerritoryControl,
  removeFeatureFromTerritoryControl,
  updateTerritoryControlMetadata,
  
  // Delete
  deleteTerritoryControl,
  
  // Query
  buildFilterQuery,
  getTerritoryControls,
  getTerritoryControlById,
  getTerritoryControlByDate,
  getClosestTerritoryControlToDate,
  getAvailableDates,
  
  // Stats
  getTerritoryControlStats,
  getControllerStats,
  getTerritoryTimeline,
  getControlChangesSummary
}; 