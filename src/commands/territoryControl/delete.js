const TerritoryControl = require('../../models/TerritoryControl');
const logger = require('../../config/logger');
const ErrorResponse = require('../../utils/errorResponse');

/**
 * Delete a territory control by ID
 * @param {String} territoryControlId - Territory control ID to delete
 * @param {Object} options - Deletion options
 * @returns {Promise<Object>} - Deleted territory control
 */
const deleteTerritoryControl = async (territoryControlId, options = {}) => {
  const territoryControl = await TerritoryControl.findById(territoryControlId);

  if (!territoryControl) {
    throw new ErrorResponse(`Territory control not found with id of ${territoryControlId}`, 404);
  }

  // Check if this is the only territory control (might want to prevent deletion)
  if (options.preventLastDeletion) {
    const totalCount = await TerritoryControl.countDocuments();
    if (totalCount <= 1) {
      throw new ErrorResponse('Cannot delete the last territory control record', 400);
    }
  }

  // Store data for logging before deletion
  const deletionInfo = {
    id: territoryControl._id,
    date: territoryControl.date,
    featuresCount: territoryControl.features.length,
    controllers: territoryControl.features.map(f => f.properties.controlledBy)
  };

  try {
    await TerritoryControl.findByIdAndDelete(territoryControlId);

    logger.info('Territory control deleted successfully', {
      territoryControlId,
      deletionInfo
    });

    return territoryControl;
  } catch (error) {
    logger.error('Failed to delete territory control', {
      error: error.message,
      territoryControlId
    });
    
    throw error;
  }
};

/**
 * Delete territory controls by date range
 * @param {String|Date} startDate - Start date (inclusive)
 * @param {String|Date} endDate - End date (inclusive)
 * @param {Object} options - Deletion options
 * @returns {Promise<Object>} - Deletion result
 */
const deleteTerritoryControlsByDateRange = async (startDate, endDate, options = {}) => {
  const query = {
    date: {
      $gte: new Date(startDate),
      $lte: new Date(endDate)
    }
  };

  // Get the records to be deleted for logging
  const territoryControlsToDelete = await TerritoryControl.find(query);

  if (territoryControlsToDelete.length === 0) {
    return {
      deletedCount: 0,
      deletedRecords: []
    };
  }

  // Check if this would delete all records
  if (options.preventAllDeletion) {
    const totalCount = await TerritoryControl.countDocuments();
    if (territoryControlsToDelete.length >= totalCount) {
      throw new ErrorResponse('Cannot delete all territory control records', 400);
    }
  }

  try {
    const deleteResult = await TerritoryControl.deleteMany(query);

    const deletionInfo = territoryControlsToDelete.map(tc => ({
      id: tc._id,
      date: tc.date,
      featuresCount: tc.features.length
    }));

    logger.info('Territory controls deleted by date range', {
      dateRange: { startDate, endDate },
      deletedCount: deleteResult.deletedCount,
      deletionInfo
    });

    return {
      deletedCount: deleteResult.deletedCount,
      deletedRecords: deletionInfo
    };
  } catch (error) {
    logger.error('Failed to delete territory controls by date range', {
      error: error.message,
      dateRange: { startDate, endDate }
    });
    
    throw error;
  }
};

/**
 * Delete territory controls by controller
 * @param {String} controlledBy - Controller identifier
 * @param {Object} options - Deletion options
 * @returns {Promise<Object>} - Deletion result
 */
const deleteTerritoryControlsByController = async (controlledBy) => {
  // Find territory controls that have features controlled by the specified controller
  const query = {
    'features.properties.controlledBy': controlledBy
  };

  const territoryControlsToUpdate = await TerritoryControl.find(query);

  if (territoryControlsToUpdate.length === 0) {
    return {
      updatedCount: 0,
      deletedCount: 0,
      updatedRecords: []
    };
  }

  let updatedCount = 0;
  let deletedCount = 0;
  const updatedRecords = [];

  try {
    for (const territoryControl of territoryControlsToUpdate) {
      // Remove features controlled by the specified controller
      const originalFeaturesCount = territoryControl.features.length;
      territoryControl.features = territoryControl.features.filter(
        feature => feature.properties.controlledBy !== controlledBy
      );

      const remainingFeaturesCount = territoryControl.features.length;

      if (remainingFeaturesCount === 0) {
        // Delete the entire territory control if no features remain
        await TerritoryControl.findByIdAndDelete(territoryControl._id);
        deletedCount++;
        
        updatedRecords.push({
          id: territoryControl._id,
          action: 'deleted',
          date: territoryControl.date,
          originalFeaturesCount,
          remainingFeaturesCount: 0
        });
      } else if (remainingFeaturesCount < originalFeaturesCount) {
        // Update the territory control with remaining features
        await territoryControl.save();
        updatedCount++;
        
        updatedRecords.push({
          id: territoryControl._id,
          action: 'updated',
          date: territoryControl.date,
          originalFeaturesCount,
          remainingFeaturesCount,
          removedFeaturesCount: originalFeaturesCount - remainingFeaturesCount
        });
      }
    }

    logger.info('Territory controls processed for controller deletion', {
      controlledBy,
      updatedCount,
      deletedCount,
      updatedRecords
    });

    return {
      updatedCount,
      deletedCount,
      updatedRecords
    };
  } catch (error) {
    logger.error('Failed to delete territory controls by controller', {
      error: error.message,
      controlledBy
    });
    
    throw error;
  }
};

/**
 * Delete all territory control data (use with extreme caution)
 * @param {Object} confirmationOptions - Confirmation options
 * @returns {Promise<Object>} - Deletion result
 */
const deleteAllTerritoryControls = async (confirmationOptions = {}) => {
  // Require explicit confirmation
  if (!confirmationOptions.confirmDeletion || confirmationOptions.confirmationText !== 'DELETE_ALL_TERRITORY_CONTROLS') {
    throw new ErrorResponse(
      'Deletion of all territory controls requires explicit confirmation. Set confirmDeletion to true and confirmationText to "DELETE_ALL_TERRITORY_CONTROLS"',
      400
    );
  }

  try {
    const totalCount = await TerritoryControl.countDocuments();
    const deleteResult = await TerritoryControl.deleteMany({});

    logger.warn('ALL TERRITORY CONTROLS DELETED', {
      deletedCount: deleteResult.deletedCount,
      originalCount: totalCount,
      timestamp: new Date().toISOString()
    });

    return {
      deletedCount: deleteResult.deletedCount,
      originalCount: totalCount,
      warning: 'All territory control data has been permanently deleted'
    };
  } catch (error) {
    logger.error('Failed to delete all territory controls', {
      error: error.message
    });
    
    throw error;
  }
};

module.exports = {
  deleteTerritoryControl,
  deleteTerritoryControlsByDateRange,
  deleteTerritoryControlsByController,
  deleteAllTerritoryControls
}; 