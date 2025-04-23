const NodeGeocoder = require('node-geocoder');
const axios = require('axios');
const logger = require('../config/logger');

// Check if HERE API key is available
if (!process.env.HERE_API_KEY) {
  logger.warn('HERE_API_KEY environment variable is not set. Geocoding will not work correctly.');
  
  // In test environment, provide guidance without revealing keys
  if (process.env.NODE_ENV === 'test') {
    logger.info('Using test environment, ensure HERE_API_KEY is set in .env.test or CI environment');
  }
}

// Using HERE as the provider
const options = {
  provider: 'here',
  apiKey: process.env.HERE_API_KEY, // Reads from environment variables
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
//
// 3. For OpenStreetMap:
// const options = {
//   provider: 'openstreetmap',
//   formatter: null
// };

let geocoder;
try {
  geocoder = NodeGeocoder(options);
  logger.info('Geocoder initialized successfully');
} catch (error) {
  logger.error(`Failed to initialize geocoder: ${error.message}`);
  // Create a dummy geocoder that will always return empty results
  // This prevents the application from crashing if geocoding fails
  geocoder = {
    geocode: async () => {
      logger.error('Geocoder not properly initialized. Using fallback that returns empty results.');
      return [];
    }
  };
}

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
 * Try to geocode with HERE API directly (fallback for when NodeGeocoder fails)
 * @param {string} query - The query string to geocode
 * @returns {Promise<Array>} - Returns geocoding results in same format as NodeGeocoder
 */
const directHereGeocode = async (query) => {
  try {
    if (!process.env.HERE_API_KEY) {
      logger.error('Cannot perform direct HERE geocoding: HERE_API_KEY is not set');
      return [];
    }
    
    const encodedQuery = encodeURIComponent(query);
    const url = `https://geocode.search.hereapi.com/v1/geocode?q=${encodedQuery}&apiKey=${process.env.HERE_API_KEY}`;
    
    const response = await axios.get(url);
    
    if (response.data && response.data.items && response.data.items.length > 0) {
      // Filter results to prioritize Syria
      let items = response.data.items;
      const syriaItems = items.filter(item => 
        item.address && (item.address.countryCode === 'SYR' || item.address.countryName === 'Syria')
      );
      
      // Use Syria items if available, otherwise use all items
      const resultsToUse = syriaItems.length > 0 ? syriaItems : items;
      
      // Convert HERE API format to NodeGeocoder format
      const formattedResults = resultsToUse.map(item => ({
        latitude: item.position.lat,
        longitude: item.position.lng,
        country: item.address.countryName || '',
        city: item.address.city || '',
        state: item.address.state || '',
        formattedAddress: item.address.label || '',
      }));
      
      if (formattedResults.length > 0) {
        logger.info(`Direct HERE geocoding successful for ${query}: [${formattedResults[0].longitude}, ${formattedResults[0].latitude}]`);
      }
      
      return formattedResults;
    }
    
    return [];
  } catch (error) {
    logger.warn(`Direct HERE geocoding failed for "${query}": ${error.message}`);
    return [];
  }
};

/**
 * Try to geocode with different query strategies
 * @param {string} query - The query string to try
 * @returns {Promise<Array>} - Returns geocoding results
 */
const tryGeocode = async (query) => {
  try {
    // First try with NodeGeocoder
    const results = await geocoder.geocode(query);
    if (results && results.length > 0) {
      logger.info(`Geocoding successful for ${query}: [${results[0].longitude}, ${results[0].latitude}]`);
      return results;
    }
    
    // If NodeGeocoder fails, try direct HERE API call
    const directResults = await directHereGeocode(query);
    if (directResults && directResults.length > 0) {
      return directResults;
    }
    
    return null;
  } catch (error) {
    logger.warn(`Geocoding attempt failed for "${query}": ${error.message}`);
    
    // Try direct HERE API as fallback on exception
    try {
      const directResults = await directHereGeocode(query);
      if (directResults && directResults.length > 0) {
        return directResults;
      }
    } catch (directError) {
      logger.error(`Direct geocoding also failed: ${directError.message}`);
    }
    
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
    
    // Final attempt: try just the placeName without Syria (might help with international recognition)
    const lastChanceResults = await tryGeocode(cleanedPlaceName);
    if (lastChanceResults) {
      return lastChanceResults;
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