const mongoose = require('mongoose');
const Violation = require('../models/Violation');
const crypto = require('crypto');
const path = require('path');
const dotenv = require('dotenv');
const stringSimilarity = require('string-similarity');

// ============================================================================
// CONFIGURATION
// ============================================================================
const CONFIG = {
  // Batch size for processing
  batchSize: 50,
  
  // Environment files
  localEnvFile: '.env.development',
  productionEnvFile: '.env.staging'
};

// Function to parse command line arguments
function parseArguments() {
  const args = process.argv.slice(2);
  
  if (args.length < 2) {
    console.error('Usage: node importViolationsToProduction.js <startDate> <endDate>');
    console.error('Example: node importViolationsToProduction.js 2025-06-30 2025-07-02');
    console.error('Dates should be in YYYY-MM-DD format');
    process.exit(1);
  }
  
  const [startDate, endDate] = args;
  
  // Validate date format (YYYY-MM-DD)
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(startDate) || !dateRegex.test(endDate)) {
    console.error('Error: Dates must be in YYYY-MM-DD format');
    console.error('Example: 2025-06-30');
    process.exit(1);
  }
  
  // Validate that startDate is not after endDate
  if (new Date(startDate) > new Date(endDate)) {
    console.error('Error: startDate cannot be after endDate');
    process.exit(1);
  }
  
  return { startDate, endDate };
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

// Configuration for duplicate detection
const DUPLICATE_CONFIG = {
  similarityThreshold: 0.75, // Adjust this value based on your needs (0-1)
  maxDistanceMeters: 100, // Maximum distance between coordinates to consider as same location
};

// Calculate distance between two points using Haversine formula
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3; // Earth's radius in meters
  const φ1 = lat1 * Math.PI/180;
  const φ2 = lat2 * Math.PI/180;
  const Δφ = (lat2-lat1) * Math.PI/180;
  const Δλ = (lon2-lon1) * Math.PI/180;

  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
          Math.cos(φ1) * Math.cos(φ2) *
          Math.sin(Δλ/2) * Math.sin(Δλ/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

  return R * c; // Distance in meters
}

// Compare dates by converting to ISO string and comparing only the date part
function compareDates(date1, date2) {
  const d1 = new Date(date1).toISOString().split('T')[0];
  const d2 = new Date(date2).toISOString().split('T')[0];
  return d1 === d2;
}

// Check if two violations are duplicates using comprehensive logic
function areViolationsDuplicate(violation1, violation2) {
  // Check if they match on key fields
  const sameType = violation1.type === violation2.type;
  const sameDate = compareDates(violation1.date, violation2.date);
  const samePerpetrator = violation1.perpetrator_affiliation === violation2.perpetrator_affiliation;
  
  // Check if coordinates are within the specified distance
  let distance = Infinity;
  let nearbyLocation = false;
  if (violation1.location.coordinates && violation2.location.coordinates) {
    const [lon1, lat1] = violation1.location.coordinates;
    const [lon2, lat2] = violation2.location.coordinates;
    distance = calculateDistance(lat1, lon1, lat2, lon2);
    nearbyLocation = distance <= DUPLICATE_CONFIG.maxDistanceMeters;
  }

  // Check casualties match
  const sameCasualties = JSON.stringify(violation1.casualties) === JSON.stringify(violation2.casualties);
  
  // Calculate description similarity
  const similarity = stringSimilarity.compareTwoStrings(
    violation1.description.en,
    violation2.description.en
  );

  // If they match on key fields OR have high description similarity
  return (sameType && sameDate && samePerpetrator && nearbyLocation && sameCasualties) || 
         similarity >= DUPLICATE_CONFIG.similarityThreshold;
}

// Function to generate content hash for violations
function generateContentHash(violation) {
  const hashContent = JSON.stringify({
    type: violation.type,
    date: violation.date ? new Date(violation.date).toISOString().split('T')[0] : '',
    perpetrator_affiliation: violation.perpetrator_affiliation || '',
    coordinates: violation.location?.coordinates || [],
    description_en: violation.description?.en?.trim()?.toLowerCase().substring(0, 200) || ''
  });
  return crypto.createHash('sha256').update(hashContent).digest('hex');
}

// Function to load environment and get connection
async function createConnection(envFile, connectionName) {
  const envPath = path.resolve(process.cwd(), envFile);
  
  // Check if env file exists
  const fs = require('fs');
  if (!fs.existsSync(envPath)) {
    throw new Error(`Environment file not found: ${envPath}`);
  }
  
  // Clear any existing environment variables to avoid conflicts
  delete process.env.MONGO_URI;
  
  // Load the environment file
  const result = dotenv.config({ path: envPath, override: true });
  if (result.error) {
    throw new Error(`Failed to load environment file ${envPath}: ${result.error.message}`);
  }
  
  console.log(`Loaded ${connectionName} environment from: ${envPath}`);
  
  const uri = process.env.MONGO_URI;
  if (!uri) {
    throw new Error(`MONGO_URI not set in ${envFile}`);
  }
  
  // Mask the URI for logging (hide password)
  const maskedUri = uri.replace(/:([^@]+)@/, ':***@');
  console.log(`Connecting to ${connectionName} database: ${maskedUri}`);
  
  const connection = await mongoose.createConnection(uri);
  console.log(`Connected to ${connectionName} database`);
  
  return connection;
}

// ============================================================================
// MAIN IMPORT FUNCTION
// ============================================================================

async function importViolationsToProduction() {
  let localConnection, prodConnection;
  
  try {
    // Parse command line arguments
    const { startDate: configStartDate, endDate: configEndDate } = parseArguments();
    
    console.log('=== Starting Violation Import Script ===');
    console.log(`Importing violations from ${configStartDate} to ${configEndDate}`);
    
    // Create connections to both databases
    localConnection = await createConnection(CONFIG.localEnvFile, 'local (development)');
    prodConnection = await createConnection(CONFIG.productionEnvFile, 'production (staging)');

    // Get models
    const LocalViolation = localConnection.model('Violation', Violation.schema);
    const ProdViolation = prodConnection.model('Violation', Violation.schema);

    // Calculate date range
    const startDate = new Date(configStartDate);
    const endDate = new Date(configEndDate);
    const startOfDay = new Date(startDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(endDate);
    endOfDay.setHours(23, 59, 59, 999);
    
    console.log('\n=== Date Range Analysis ===');
    console.log(`Start date: ${configStartDate}`);
    console.log(`End date: ${configEndDate}`);
    console.log(`Search range: ${startOfDay.toISOString()} to ${endOfDay.toISOString()}`);

    // Query for violations on the target date using reported_date range
    const localViolations = await LocalViolation.find({
      reported_date: {
        $gte: startOfDay,
        $lte: endOfDay
      }
    }).lean();
    
    console.log(`\nFound ${localViolations.length} violations with reported_date ${configStartDate} to ${configEndDate} in local database`);

    if (localViolations.length === 0) {
      console.log('No violations found with the specified date range. Exiting...');
      return;
    }

    // Get existing violations from production database for duplicate checking
    console.log('\n=== Checking for Duplicates ===');
    const existingViolations = await ProdViolation.find({}).lean();
    console.log(`Found ${existingViolations.length} existing violations in production database`);

    // Filter out duplicates
    const violationsToImport = [];
    const duplicateViolations = [];
    
    for (const localViolation of localViolations) {
      let isDuplicate = false;
      
      // Check against existing violations
      for (const existingViolation of existingViolations) {
        if (areViolationsDuplicate(localViolation, existingViolation)) {
          isDuplicate = true;
          duplicateViolations.push({
            local: localViolation,
            existing: existingViolation
          });
          break;
        }
      }
      
      if (!isDuplicate) {
        violationsToImport.push(localViolation);
      }
    }

    console.log('\nDuplicate Analysis:');
    console.log(`- Total violations found: ${localViolations.length}`);
    console.log(`- Duplicates detected: ${duplicateViolations.length}`);
    console.log(`- Violations to import: ${violationsToImport.length}`);
    console.log(`- Violations to skip: ${duplicateViolations.length}`);

    if (duplicateViolations.length > 0) {
      console.log('\nSample duplicates that will be skipped:');
      duplicateViolations.slice(0, 3).forEach((duplicate, index) => {
        const localDate = new Date(duplicate.local.date).toISOString().split('T')[0];
        const existingDate = new Date(duplicate.existing.date).toISOString().split('T')[0];
        console.log(`  ${index + 1}. Local: ${duplicate.local.type} on ${localDate} at ${duplicate.local.location?.name?.en}`);
        console.log(`     Existing: ${duplicate.existing.type} on ${existingDate} at ${duplicate.existing.location?.name?.en}`);
      });
    }

    if (violationsToImport.length === 0) {
      console.log('\nAll violations are duplicates. Nothing to import.');
      return;
    }

    // Show sample violations to be imported
    console.log('\nSample violations to be imported:');
    violationsToImport.slice(0, 3).forEach((violation, index) => {
      const reportedDate = new Date(violation.reported_date).toISOString().split('T')[0];
      const incidentDate = new Date(violation.date).toISOString().split('T')[0];
      console.log(`  ${index + 1}. Type: ${violation.type}, Reported: ${reportedDate}, Incident: ${incidentDate}, Location: ${violation.location?.name?.en}`);
    });

    // Initialize counters
    let processedCount = 0;
    let successCount = 0;
    let errorCount = 0;
    let skippedCount = 0;

    console.log('\n=== Starting Import Process ===');
    console.log(`Processing ${violationsToImport.length} violations in batches of ${CONFIG.batchSize}`);

    // Process in batches
    for (let i = 0; i < violationsToImport.length; i += CONFIG.batchSize) {
      const batch = violationsToImport.slice(i, i + CONFIG.batchSize);
      const batchNumber = Math.floor(i / CONFIG.batchSize) + 1;
      
      console.log(`\n--- Processing Batch ${batchNumber} (${batch.length} violations) ---`);
      
      // Remove _id and __v fields from each violation and generate content_hash
      const cleanBatch = batch.map(violation => {
        // eslint-disable-next-line no-unused-vars
        const { _id, __v, ...cleanViolation } = violation;
        
        if (cleanViolation.victims) {
          cleanViolation.victims = cleanViolation.victims.map(victim => {
            // eslint-disable-next-line no-unused-vars
            const { _id, ...cleanVictim } = victim;
            return cleanVictim;
          });
        }
        
        cleanViolation.content_hash = generateContentHash(cleanViolation);
        return cleanViolation;
      });
      
      const operations = cleanBatch.map(violation => {
        // eslint-disable-next-line no-unused-vars
        const { content_hash, ...violationWithoutHash } = violation;
        
        return {
          updateOne: {
            filter: {
              content_hash: violation.content_hash  // Use content_hash for precise duplicate detection
            },
            update: { $set: violationWithoutHash },
            upsert: true
          }
        };
      });
      
      try {
        const result = await ProdViolation.bulkWrite(operations);
        processedCount += batch.length;
        successCount += result.upsertedCount + result.modifiedCount;
        skippedCount += result.matchedCount - result.modifiedCount;
        errorCount += result.writeErrors ? result.writeErrors.length : 0;
        
        console.log(`Batch ${batchNumber} completed:`);
        console.log(`  - Upserted: ${result.upsertedCount}`);
        console.log(`  - Modified: ${result.modifiedCount}`);
        console.log(`  - Matched (no change): ${result.matchedCount - result.modifiedCount}`);
        console.log(`  - Errors: ${result.writeErrors ? result.writeErrors.length : 0}`);
        
      } catch (error) {
        console.error(`Error processing batch ${batchNumber}:`, error.message);
        errorCount += batch.length;
      }
    }
    
    // Verify the data was actually imported
    console.log('\n=== Verification ===');
    const importedViolations = await ProdViolation.find({
      reported_date: {
        $gte: startOfDay,
        $lte: endOfDay
      }
    }).lean();
    console.log(`Violations found in production database with reported_date ${configStartDate} to ${configEndDate}: ${importedViolations.length}`);
    
    // Summary
    console.log('\n=== Migration Summary ===');
    console.log(`- Total violations found: ${localViolations.length}`);
    console.log(`- Duplicates detected and skipped: ${duplicateViolations.length}`);
    console.log(`- Violations processed for import: ${violationsToImport.length}`);
    console.log(`- Total processed: ${processedCount}`);
    console.log(`- Successfully migrated: ${successCount}`);
    console.log(`- Skipped (already existed): ${skippedCount}`);
    console.log(`- Errors: ${errorCount}`);
    
    if (errorCount > 0) {
      console.log('\n⚠️  Some violations failed to import. Check the logs above for details.');
    } else if (importedViolations.length === 0) {
      console.log('\n❌ No violations found in production database. Import may have failed silently.');
    } else {
      console.log('\n✅ Import completed successfully!');
    }

  } catch (error) {
    console.error('❌ Error during migration:', error.message);
    if (error.stack) {
      console.error('Stack trace:', error.stack);
    }
    process.exit(1);
  } finally {
    // Always close connections
    if (localConnection) {
      await localConnection.close();
      console.log('Local database connection closed');
    }
    if (prodConnection) {
      await prodConnection.close();
      console.log('Production database connection closed');
    }
    console.log('=== Script completed ===');
  }
}

// ============================================================================
// SCRIPT EXECUTION
// ============================================================================

if (require.main === module) {
  importViolationsToProduction();
}

module.exports = importViolationsToProduction; 