/**
 * Territory Control Color Mapping Configuration
 * 
 * This configuration maps territory controller types to their respective colors
 * for frontend display. Colors are defined in hex format.
 */

const territoryControlColors = {
  assad_regime: '#ff0000',
  post_8th_december_government: '#008000',
  GOVERNMENT: '#ba0000',
  REBEL_GROUP: '#4CAF50',
  sdf: '#FFFF00',
  FOREIGN_MILITARY: '#ffeb3b',
  isis: '#000000',
  TERRORIST_ORGANIZATION: '#000000',
  various_armed_groups: '#808080',
  israel: '#0000FF',
  turkey: '#00FF00',
  druze_militias: '#FFFFFF',
  russia: '#FF4500',
  iran_shia_militias: '#FFA500',
  international_coalition: '#9370DB',
  unknown: '#800080'
};

/**
 * Get color for a specific territory controller
 * @param {string} controlledBy - The controller type
 * @returns {string} - The hex color code
 */
const getColorForController = (controlledBy) => {
  return territoryControlColors[controlledBy] || territoryControlColors.unknown;
};

/**
 * Add color attributes to territory control features
 * @param {Object} territoryControl - Territory control object with features
 * @returns {Object} - Territory control object with color attributes added
 */
const addColorsToTerritoryControl = (territoryControl) => {
  if (!territoryControl || !territoryControl.features) {
    return territoryControl;
  }

  // Convert Mongoose document to plain object if needed
  const plainTerritoryControl = territoryControl.toObject ? territoryControl.toObject() : territoryControl;
  
  const updatedTerritoryControl = { ...plainTerritoryControl };
  
  updatedTerritoryControl.features = plainTerritoryControl.features.map(feature => {
    // Convert Mongoose subdocument to plain object if needed
    const plainFeature = feature.toObject ? feature.toObject() : feature;
    const updatedFeature = { ...plainFeature };
    
    if (updatedFeature.properties) {
      updatedFeature.properties = {
        ...updatedFeature.properties,
        color: getColorForController(updatedFeature.properties.controlledBy)
      };
    }
    
    return updatedFeature;
  });

  return updatedTerritoryControl;
};

module.exports = {
  territoryControlColors,
  getColorForController,
  addColorsToTerritoryControl
}; 