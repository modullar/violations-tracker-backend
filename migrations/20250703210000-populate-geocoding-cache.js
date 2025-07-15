const { generateCacheKey } = require('../src/utils/geocoder');

/**
 * Migration to populate GeocodingCache with existing violation coordinates
 * This prevents unnecessary API calls for locations we've already geocoded
 */

module.exports = {
  /**
   * @param db {import('mongodb').Db}
   */
  async up(db) {
    console.log('Starting geocoding cache population migration...');
    
    const startTime = Date.now();
    
    // Get all violations that have coordinates
    const violations = await db.collection('violations').find({
      'location.coordinates': { $exists: true, $ne: null, $not: { $size: 0 } }
    }).toArray();
    
    console.log(`Found ${violations.length} violations with coordinates`);
    
    if (violations.length === 0) {
      console.log('No violations with coordinates found. Migration completed.');
      return;
    }
    
    // Create a map to deduplicate locations
    const locationMap = new Map();
    
    // Process each violation to extract unique location combinations
    for (const violation of violations) {
      const location = violation.location;
      
      if (!location.coordinates || location.coordinates.length !== 2) {
        continue;
      }
      
      const [longitude, latitude] = location.coordinates;
      
      // Validate coordinates
      if (longitude < -180 || longitude > 180 || latitude < -90 || latitude > 90) {
        console.warn(`Skipping invalid coordinates for violation ${violation._id}: [${longitude}, ${latitude}]`);
        continue;
      }
      
      // Process both English and Arabic location names if available
      const locationVariations = [];
      
      // English variation
      if (location.name?.en) {
        locationVariations.push({
          placeName: location.name.en,
          adminDivision: location.administrative_division?.en || '',
          language: 'en'
        });
      }
      
      // Arabic variation
      if (location.name?.ar) {
        locationVariations.push({
          placeName: location.name.ar,
          adminDivision: location.administrative_division?.ar || '',
          language: 'ar'
        });
      }
      
      // Create cache entries for each variation
      for (const variation of locationVariations) {
        try {
          // Generate cache key using the same function as the geocoding system
          const cacheKey = generateCacheKey(
            variation.placeName,
            variation.adminDivision,
            variation.language
          );
          
          if (!locationMap.has(cacheKey)) {
            // Estimate quality based on available data
            let quality = 0.7; // Base quality for existing coordinates
            
            // Boost quality if we have admin division
            if (variation.adminDivision && variation.adminDivision.trim().length > 0) {
              quality += 0.1;
            }
            
            // Boost quality if location name is detailed (more than just city name)
            if (variation.placeName.length > 10) {
              quality += 0.1;
            }
            
            // Cap quality at 0.9 (since these are pre-existing, not fresh from API)
            quality = Math.min(quality, 0.9);
            
            locationMap.set(cacheKey, {
              cacheKey,
              searchTerms: {
                placeName: variation.placeName,
                adminDivision: variation.adminDivision,
                language: variation.language
              },
              results: {
                coordinates: [longitude, latitude],
                formattedAddress: `${variation.placeName}${variation.adminDivision ? ', ' + variation.adminDivision : ''}`,
                country: 'Syria', // Default for this dataset
                city: variation.placeName,
                state: variation.adminDivision || '',
                quality: quality
              },
              source: 'manual', // Mark as manually migrated data
              apiCallsUsed: 0, // No API calls were used for this data
              hitCount: 1,
              lastUsed: new Date(),
              createdAt: new Date(),
              updatedAt: new Date()
            });
          } else {
            // If we already have this cache key, increment hit count
            // (indicates this location appears in multiple violations)
            const existingEntry = locationMap.get(cacheKey);
            existingEntry.hitCount += 1;
          }
        } catch (error) {
          console.warn(`Failed to generate cache key for violation ${violation._id}:`, error.message);
        }
      }
    }
    
    const uniqueLocations = Array.from(locationMap.values());
    console.log(`Created ${uniqueLocations.length} unique cache entries`);
    
    if (uniqueLocations.length === 0) {
      console.log('No valid location data found. Migration completed.');
      return;
    }
    
    // Insert cache entries in batches to avoid overwhelming the database
    const batchSize = 100;
    let insertedCount = 0;
    let skippedCount = 0;
    
    for (let i = 0; i < uniqueLocations.length; i += batchSize) {
      const batch = uniqueLocations.slice(i, i + batchSize);
      
      try {
        // Use insertMany with ordered: false to continue on duplicates
        const result = await db.collection('geocodingcaches').insertMany(batch, { 
          ordered: false 
        });
        insertedCount += result.insertedCount;
        console.log(`Inserted batch ${Math.floor(i / batchSize) + 1}: ${result.insertedCount} entries`);
      } catch (error) {
        // Handle duplicate key errors (in case migration is run multiple times)
        if (error.code === 11000) {
          // Count successful inserts from the error details
          const successfulInserts = error.result?.insertedCount || 0;
          insertedCount += successfulInserts;
          skippedCount += batch.length - successfulInserts;
          console.log(`Batch ${Math.floor(i / batchSize) + 1}: ${successfulInserts} inserted, ${batch.length - successfulInserts} skipped (duplicates)`);
        } else {
          console.error(`Error inserting batch ${Math.floor(i / batchSize) + 1}:`, error.message);
          throw error;
        }
      }
    }
    
    const endTime = Date.now();
    const duration = (endTime - startTime) / 1000;
    
    console.log('\n=== Migration Summary ===');
    console.log(`Processing time: ${duration.toFixed(2)} seconds`);
    console.log(`Violations processed: ${violations.length}`);
    console.log(`Unique cache entries created: ${uniqueLocations.length}`);
    console.log(`Successfully inserted: ${insertedCount}`);
    console.log(`Skipped (duplicates): ${skippedCount}`);
    console.log(`Total API calls saved: ~${insertedCount * 2} (estimated future calls)`);
    
    // Create indexes if they don't exist
    console.log('\nEnsuring indexes...');
    try {
      await db.collection('geocodingcaches').createIndex({ cacheKey: 1 }, { unique: true });
      await db.collection('geocodingcaches').createIndex({ createdAt: 1 }, { expireAfterSeconds: 7776000 });
      await db.collection('geocodingcaches').createIndex({ lastUsed: -1 });
      await db.collection('geocodingcaches').createIndex({ hitCount: -1 });
      console.log('Indexes created successfully');
    } catch (error) {
      console.log('Indexes already exist or creation failed:', error.message);
    }
    
    console.log('\nGeocodingCache population migration completed successfully! 🎉');
  },

  /**
   * @param db {import('mongodb').Db}
   */
  async down(db) {
    console.log('Rolling back geocoding cache population...');
    
    // Remove all cache entries that were created by this migration
    const result = await db.collection('geocodingcaches').deleteMany({
      source: 'manual'
    });
    
    console.log(`Removed ${result.deletedCount} cache entries created by migration`);
    console.log('Rollback completed.');
  }
}; 