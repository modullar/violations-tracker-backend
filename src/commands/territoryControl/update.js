const TerritoryControl = require('../../models/TerritoryControl');
const logger = require('../../config/logger');
const ErrorResponse = require('../../utils/errorResponse');

/**
 * Update a territory control record
 * @param {String} territoryControlId - Territory control ID to update
 * @param {Object} updateData - Data to update
 * @param {String} userId - User ID performing the update
 * @param {Object} options - Update options
 * @returns {Promise<Object>} - Updated territory control
 */
const updateTerritoryControl = async (territoryControlId, updateData, userId, options = {}) => {
  // Find the existing territory control
  const existingTerritoryControl = await TerritoryControl.findById(territoryControlId);

  if (!existingTerritoryControl) {
    throw new ErrorResponse(`Territory control not found with id of ${territoryControlId}`, 404);
  }

  // Check if date is being updated and if it would create a duplicate
  if (updateData.date && updateData.date !== existingTerritoryControl.date.toISOString().split('T')[0]) {
    const duplicateCheck = await TerritoryControl.findOne({
      date: new Date(updateData.date),
      _id: { $ne: territoryControlId }
    });

    if (duplicateCheck && !options.allowDuplicateDates) {
      throw new ErrorResponse(
        `Territory control data already exists for date ${updateData.date}`,
        409
      );
    }
  }

  // Validate and sanitize update data
  const sanitizedData = TerritoryControl.sanitizeData({
    ...existingTerritoryControl.toObject(),
    ...updateData
  });

  // Validate the updated data
  await TerritoryControl._validateBusinessRules(sanitizedData, [], {
    allowDuplicateDates: options.allowDuplicateDates || false
  });

  // Add user information
  sanitizedData.updated_by = userId;
  
  // Remove fields that shouldn't be updated directly
  delete sanitizedData._id;
  delete sanitizedData.createdAt;
  delete sanitizedData.updatedAt;
  delete sanitizedData.__v;

  try {
    // Update the territory control
    const updatedTerritoryControl = await TerritoryControl.findByIdAndUpdate(
      territoryControlId,
      sanitizedData,
      {
        new: true,
        runValidators: true
      }
    )
      .populate('created_by', 'name')
      .populate('updated_by', 'name');

    logger.info('Territory control updated successfully', {
      territoryControlId,
      date: updatedTerritoryControl.date,
      featuresCount: updatedTerritoryControl.features.length,
      updatedBy: userId
    });

    return updatedTerritoryControl;
  } catch (error) {
    logger.error('Failed to update territory control', {
      error: error.message,
      territoryControlId,
      userId
    });
    
    throw error;
  }
};

/**
 * Update specific features within a territory control
 * @param {String} territoryControlId - Territory control ID
 * @param {Array} featureUpdates - Array of feature updates
 * @param {String} userId - User ID performing the update
 * @returns {Promise<Object>} - Updated territory control
 */
const updateTerritoryControlFeatures = async (territoryControlId, featureUpdates, userId) => {
  // Build atomic update operations
  const updateOperations = {
    $set: {
      updated_by: userId,
      updatedAt: new Date()
    }
  };

  // Apply feature updates atomically
  featureUpdates.forEach(update => {
    const { index, data } = update;
    
    // Create set operations for each field in the feature data
    Object.keys(data).forEach(key => {
      updateOperations.$set[`features.${index}.${key}`] = data[key];
    });
  });

  try {
    const result = await TerritoryControl.updateOne(
      { _id: territoryControlId },
      updateOperations
    );

    if (result.matchedCount === 0) {
      throw new ErrorResponse(`Territory control not found with id of ${territoryControlId}`, 404);
    }

    logger.info('Territory control features updated successfully', {
      territoryControlId,
      featuresUpdated: featureUpdates.length,
      updatedBy: userId
    });

    // Return the updated document
    return await TerritoryControl.findById(territoryControlId);
  } catch (error) {
    logger.error('Failed to update territory control features', {
      error: error.message,
      territoryControlId,
      userId
    });
    
    throw error;
  }
};

/**
 * Update metadata for a territory control
 * @param {String} territoryControlId - Territory control ID
 * @param {Object} metadataUpdate - Metadata to update
 * @param {String} userId - User ID performing the update
 * @returns {Promise<Object>} - Updated territory control
 */
const updateTerritoryControlMetadata = async (territoryControlId, metadataUpdate, userId) => {
  // Build atomic update operations
  const updateOperations = {
    $set: {
      updated_by: userId,
      updatedAt: new Date(),
      'metadata.lastVerified': new Date() // Always update last verified when metadata changes
    }
  };

  // Apply metadata updates atomically
  Object.keys(metadataUpdate).forEach(key => {
    updateOperations.$set[`metadata.${key}`] = metadataUpdate[key];
  });

  try {
    const result = await TerritoryControl.updateOne(
      { _id: territoryControlId },
      updateOperations
    );

    if (result.matchedCount === 0) {
      throw new ErrorResponse(`Territory control not found with id of ${territoryControlId}`, 404);
    }

    logger.info('Territory control metadata updated successfully', {
      territoryControlId,
      updatedBy: userId
    });

    // Return the updated document
    return await TerritoryControl.findById(territoryControlId);
  } catch (error) {
    logger.error('Failed to update territory control metadata', {
      error: error.message,
      territoryControlId,
      userId
    });
    
    throw error;
  }
};

/**
 * Add a new feature to existing territory control
 * @param {String} territoryControlId - Territory control ID
 * @param {Object} newFeature - New feature to add
 * @param {String} userId - User ID performing the update
 * @returns {Promise<Object>} - Updated territory control
 */
const addFeatureToTerritoryControl = async (territoryControlId, newFeature, userId) => {
  // Validate the new feature
  if (!newFeature.properties || !newFeature.properties.name) {
    throw new ErrorResponse('Feature must have properties with a name', 400);
  }

  if (!newFeature.geometry || !newFeature.geometry.coordinates) {
    throw new ErrorResponse('Feature must have valid geometry', 400);
  }

  // First, get the current territory control to access its date for defaults
  const currentTerritoryControl = await TerritoryControl.findById(territoryControlId);
  if (!currentTerritoryControl) {
    throw new ErrorResponse(`Territory control not found with id of ${territoryControlId}`, 404);
  }

  // Set defaults for the new feature
  const feature = {
    type: 'Feature',
    properties: {
      name: newFeature.properties.name,
      controlledBy: newFeature.properties.controlledBy || 'unknown',
      color: newFeature.properties.color || '#808080',
      controlledSince: newFeature.properties.controlledSince || currentTerritoryControl.date,
      description: newFeature.properties.description || { en: '', ar: '' }
    },
    geometry: newFeature.geometry
  };

  try {
    const result = await TerritoryControl.updateOne(
      { _id: territoryControlId },
      {
        $push: { features: feature },
        $set: { updated_by: userId, updatedAt: new Date() }
      }
    );

    if (result.matchedCount === 0) {
      throw new ErrorResponse(`Territory control not found with id of ${territoryControlId}`, 404);
    }

    logger.info('Feature added to territory control successfully', {
      territoryControlId,
      featureName: feature.properties.name,
      updatedBy: userId
    });

    // Return the updated document
    return await TerritoryControl.findById(territoryControlId);
  } catch (error) {
    logger.error('Failed to add feature to territory control', {
      error: error.message,
      territoryControlId,
      userId
    });
    
    throw error;
  }
};

/**
 * Remove a feature from territory control
 * @param {String} territoryControlId - Territory control ID
 * @param {Number} featureIndex - Index of feature to remove
 * @param {String} userId - User ID performing the update
 * @returns {Promise<Object>} - Updated territory control
 */
const removeFeatureFromTerritoryControl = async (territoryControlId, featureIndex, userId) => {
  // First, get the current territory control to validate the operation
  const territoryControl = await TerritoryControl.findById(territoryControlId);

  if (!territoryControl) {
    throw new ErrorResponse(`Territory control not found with id of ${territoryControlId}`, 404);
  }

  if (featureIndex < 0 || featureIndex >= territoryControl.features.length) {
    throw new ErrorResponse('Invalid feature index', 400);
  }

  if (territoryControl.features.length <= 1) {
    throw new ErrorResponse('Cannot remove the last feature. Territory control must have at least one feature.', 400);
  }

  // Get the feature name for logging before removal
  const removedFeatureName = territoryControl.features[featureIndex].properties.name;

  try {
    const result = await TerritoryControl.updateOne(
      { _id: territoryControlId },
      {
        $unset: { [`features.${featureIndex}`]: 1 },
        $set: { updated_by: userId, updatedAt: new Date() }
      }
    );

    if (result.matchedCount === 0) {
      throw new ErrorResponse(`Territory control not found with id of ${territoryControlId}`, 404);
    }

    // Clean up the sparse array created by $unset
    await TerritoryControl.updateOne(
      { _id: territoryControlId },
      {
        $pull: { features: null }
      }
    );

    logger.info('Feature removed from territory control successfully', {
      territoryControlId,
      removedFeatureName,
      updatedBy: userId
    });

    // Return the updated document
    return await TerritoryControl.findById(territoryControlId);
  } catch (error) {
    logger.error('Failed to remove feature from territory control', {
      error: error.message,
      territoryControlId,
      userId
    });
    
    throw error;
  }
};

module.exports = {
  updateTerritoryControl,
  updateTerritoryControlFeatures,
  updateTerritoryControlMetadata,
  addFeatureToTerritoryControl,
  removeFeatureFromTerritoryControl
}; 