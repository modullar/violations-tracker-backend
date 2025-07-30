const mongoose = require('mongoose');
const config = require('../src/config/config');
const logger = require('../src/config/logger');

async function migrateSourceUrls() {
  try {
    // Connect to MongoDB
    await mongoose.connect(config.mongoUri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    
    logger.info('Connected to MongoDB for migration');
    
    // Get the Violation model
    const Violation = require('../src/models/Violation');
    
    // Find all violations that have source_url but no source_urls
    const violations = await Violation.find({
      $and: [
        {
          $or: [
            { 'source_url.en': { $exists: true, $ne: '' } },
            { 'source_url.ar': { $exists: true, $ne: '' } }
          ]
        },
        {
          $or: [
            { source_urls: { $exists: false } },
            { source_urls: { $size: 0 } }
          ]
        }
      ]
    });
    
    logger.info(`Found ${violations.length} violations to migrate`);
    
    let migratedCount = 0;
    let skippedCount = 0;
    
    for (const violation of violations) {
      const sourceUrls = [];
      
      // Extract URLs from source_url.en if it exists and is not empty
      if (violation.source_url && violation.source_url.en && violation.source_url.en.trim()) {
        sourceUrls.push(violation.source_url.en.trim());
      }
      
      // Extract URLs from source_url.ar if it exists and is not empty
      if (violation.source_url && violation.source_url.ar && violation.source_url.ar.trim()) {
        sourceUrls.push(violation.source_url.ar.trim());
      }
      
      // If we found any URLs, update the violation
      if (sourceUrls.length > 0) {
        // Remove duplicates
        const uniqueUrls = [...new Set(sourceUrls)];
        
        await Violation.updateOne(
          { _id: violation._id },
          { 
            $set: { source_urls: uniqueUrls },
            $unset: { source_url: 1 }
          }
        );
        
        migratedCount++;
        logger.info(`Migrated violation ${violation._id}: ${uniqueUrls.length} URLs`);
      } else {
        // If no valid URLs found, set a default empty array
        await Violation.updateOne(
          { _id: violation._id },
          { 
            $set: { source_urls: [] },
            $unset: { source_url: 1 }
          }
        );
        
        skippedCount++;
        logger.warn(`No valid URLs found for violation ${violation._id}, set empty array`);
      }
    }
    
    logger.info(`Migration completed: ${migratedCount} violations migrated, ${skippedCount} violations with no URLs`);
    
    // Verify migration
    const remainingViolations = await Violation.find({
      $or: [
        { 'source_url.en': { $exists: true, $ne: '' } },
        { 'source_url.ar': { $exists: true, $ne: '' } }
      ]
    });
    
    if (remainingViolations.length > 0) {
      logger.warn(`Warning: ${remainingViolations.length} violations still have source_url field`);
    } else {
      logger.info('All violations successfully migrated');
    }
    
  } catch (error) {
    logger.error('Migration failed:', error);
    throw error;
  } finally {
    await mongoose.disconnect();
    logger.info('Disconnected from MongoDB');
  }
}

// Run migration if this file is executed directly
if (require.main === module) {
  migrateSourceUrls()
    .then(() => {
      logger.info('Migration completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      logger.error('Migration failed:', error);
      process.exit(1);
    });
}

module.exports = migrateSourceUrls; 