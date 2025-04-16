const NodeGeocoder = require('node-geocoder');
const config = require('../config/config');
const logger = require('../config/logger');

// Using OpenStreetMap as the provider (doesn't require an API key)
const options = {
  provider: 'openstreetmap',
  formatter: null
};

// Alternative providers that could be used:
// 1. For Google Maps:
// const options = {
//   provider: 'google',
//   apiKey: config.googleApiKey, // Would need to be added to config
// };
// 
// 2. For MapQuest:
// const options = {
//   provider: 'mapquest',
//   apiKey: config.mapquestApiKey, // Would need to be added to config
// };

const geocoder = NodeGeocoder(options);

/**
 * Geocode a location based on place name and administrative division
 * @param {string} placeName - Name of the place
 * @param {string} adminDivision - Administrative division (optional)
 * @returns {Promise<Array>} - Returns geocoding results
 */
const geocodeLocation = async (placeName, adminDivision = '') => {
  try {
    // Format the query with place name, admin division, and Syria as the country
    const queryString = `${placeName}${adminDivision ? ', ' + adminDivision : ''}, Syria`;
    const results = await geocoder.geocode(queryString);
    
    return results;
  } catch (error) {
    logger.error(`Geocoding error: ${error.message}`);
    throw new Error(`Failed to geocode location: ${error.message}`);
  }
};

module.exports = { geocoder, geocodeLocation };