const NodeGeocoder = require('node-geocoder');
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
 * Clean up location name by removing common words that might interfere with geocoding
 * @param {string} name - Original location name
 * @returns {string} - Cleaned location name
 */
const cleanLocationName = (name) => {
  return name
    .replace(/\bneighborhood\b/gi, '')
    .replace(/\bحي\b/g, '')  // Arabic for neighborhood
    .replace(/\s+/g, ' ')    // Remove extra spaces
    .trim();
};

/**
 * Try to geocode with different query strategies
 * @param {string} query - The query string to try
 * @returns {Promise<Array>} - Returns geocoding results
 */
const tryGeocode = async (query) => {
  try {
    const results = await geocoder.geocode(query);
    if (results && results.length > 0) {
      logger.info(`Geocoding successful for ${query}: [${results[0].longitude}, ${results[0].latitude}]`);
      return results;
    }
    return null;
  } catch (error) {
    logger.warn(`Geocoding attempt failed for "${query}": ${error.message}`);
    return null;
  }
};

/**
 * Geocode a location based on place name and administrative division
 * @param {string} placeName - Name of the place
 * @param {string} adminDivision - Administrative division (optional)
 * @returns {Promise<Array>} - Returns geocoding results
 */
const geocodeLocation = async (placeName, adminDivision = '') => {
  try {
    // Clean up the place name
    const cleanedPlaceName = cleanLocationName(placeName);
    
    // Try different geocoding strategies in order of specificity
    const strategies = [
      // 1. Full query with all details
      `${cleanedPlaceName}${adminDivision ? ', ' + adminDivision : ''}, Syria`,
      // 2. Just the place name and Syria
      `${cleanedPlaceName}, Syria`,
      // 3. Just the administrative division and Syria
      adminDivision ? `${adminDivision}, Syria` : null,
      // 4. Just the city name (extracted from adminDivision if it contains a city)
      adminDivision ? adminDivision.split(',').map(s => s.trim()).find(s => s.includes('city')) : null
    ].filter(Boolean); // Remove null values

    logger.info(`Attempting to geocode: ${placeName} (original) with strategies: ${strategies.join(', ')}`);

    // Try each strategy until one works
    for (const query of strategies) {
      const results = await tryGeocode(query);
      if (results) {
        return results;
      }
    }

    // If all strategies fail, try to extract city name from placeName
    const cityMatch = cleanedPlaceName.match(/([^,]+)\s*(?:city|town|village|neighborhood)/i);
    if (cityMatch) {
      const cityName = cityMatch[1].trim();
      const results = await tryGeocode(`${cityName}, Syria`);
      if (results) {
        return results;
      }
    }

    logger.warn(`No geocoding results found for any strategy: ${placeName}`);
    return [];
  } catch (error) {
    logger.error(`Geocoding error for "${placeName}, ${adminDivision}": ${error.message}`);
    logger.error('Full error:', error);
    throw new Error(`Failed to geocode location: ${error.message}`);
  }
};

module.exports = { geocoder, geocodeLocation };