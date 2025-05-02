const mongoose = require('mongoose');
const Violation = require('../src/models/Violation');
require('dotenv').config();

async function migrateToProduction() {
  try {
    // Connect to local database
    const localConnection = await mongoose.createConnection(process.env.MONGO_URI_LOCAL, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    console.log('Connected to local database');

    // Connect to production database
    const prodConnection = await mongoose.createConnection(process.env.MONGO_URI_PROD, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    console.log('Connected to production database');

    // Get local Violation model
    const LocalViolation = localConnection.model('Violation', Violation.schema);
    
    // Get production Violation model
    const ProdViolation = prodConnection.model('Violation', Violation.schema);

    // Get all violations from local
    const localViolations = await LocalViolation.find({}).lean();
    console.log(`Found ${localViolations.length} violations in local database`);

    // Batch size for processing
    const BATCH_SIZE = 100;
    let processedCount = 0;
    let successCount = 0;
    let errorCount = 0;

    // Process in batches
    for (let i = 0; i < localViolations.length; i += BATCH_SIZE) {
      const batch = localViolations.slice(i, i + BATCH_SIZE);
      
      // Remove _id and __v fields from each violation
      const cleanBatch = batch.map(violation => {
        const { _id, __v, ...cleanViolation } = violation;
        
        // Also clean _id from nested objects if they exist
        if (cleanViolation.victims) {
          cleanViolation.victims = cleanViolation.victims.map(victim => {
            const { _id, ...cleanVictim } = victim;
            return cleanVictim;
          });
        }
        
        return cleanViolation;
      });

      const operations = cleanBatch.map(violation => ({
        updateOne: {
          filter: {
            type: violation.type,
            date: violation.date,
            'location.name.en': violation.location.name.en,
            perpetrator_affiliation: violation.perpetrator_affiliation
          },
          update: { $set: violation },
          upsert: true
        }
      }));

      try {
        const result = await ProdViolation.bulkWrite(operations);
        processedCount += batch.length;
        successCount += result.upsertedCount + result.modifiedCount;
        errorCount += result.writeErrors ? result.writeErrors.length : 0;

        console.log(`Processed batch ${i / BATCH_SIZE + 1}:`);
        console.log(`- Total processed: ${processedCount}/${localViolations.length}`);
        console.log(`- Successfully migrated: ${successCount}`);
        console.log(`- Errors: ${errorCount}`);
      } catch (error) {
        console.error(`Error processing batch ${i / BATCH_SIZE + 1}:`, error);
        errorCount += batch.length;
      }
    }

    console.log('\nMigration Summary:');
    console.log(`- Total violations processed: ${processedCount}`);
    console.log(`- Successfully migrated: ${successCount}`);
    console.log(`- Errors: ${errorCount}`);

    // Close connections
    await localConnection.close();
    await prodConnection.close();
    console.log('Database connections closed');

  } catch (error) {
    console.error('Error during migration:', error);
    process.exit(1);
  }
}

// Run the script
migrateToProduction(); 