const mongoose = require('mongoose');
const Violation = require('../models/Violation');
const { mergeViolations } = require('../commands/violations/merge');
require('dotenv').config();

/**
 * Clean up race condition duplicates by finding truly identical violations
 * and merging them into a single violation
 */
async function cleanupRaceConditionDuplicates() {
  try {
    // Connect to database
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB');

    // Find violations with identical key characteristics
    const pipeline = [
      {
        $group: {
          _id: {
            type: '$type',
            date: { $dateToString: { format: '%Y-%m-%d', date: '$date' } },
            perpetrator_affiliation: '$perpetrator_affiliation',
            coordinates: '$location.coordinates',
            description_en: { 
              $substr: [
                { $toLower: { $trim: { input: '$description.en' } } }, 
                0, 
                200
              ] 
            }
          },
          violations: { $push: '$$ROOT' },
          count: { $sum: 1 }
        }
      },
      {
        $match: { count: { $gt: 1 } }
      },
      {
        $sort: { count: -1 }
      }
    ];

    const duplicateGroups = await Violation.aggregate(pipeline);
    
    console.log(`Found ${duplicateGroups.length} groups of duplicate violations`);
    
    for (const group of duplicateGroups) {
      const violations = group.violations;
      console.log(`\n=== Processing group with ${violations.length} duplicates ===`);
      console.log(`Type: ${group._id.type}`);
      console.log(`Date: ${group._id.date}`);
      console.log(`Perpetrator: ${group._id.perpetrator_affiliation}`);
      console.log(`Location: ${group._id.coordinates}`);
      console.log(`Description: ${group._id.description_en.substring(0, 50)}...`);
      
      // Sort by creation date to keep the earliest one
      violations.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
      
      const keepViolation = violations[0];
      const duplicatesToDelete = violations.slice(1);
      
      console.log(`Keeping violation: ${keepViolation._id} (created: ${keepViolation.createdAt})`);
      console.log(`Deleting ${duplicatesToDelete.length} duplicates:`);
      
      for (const duplicate of duplicatesToDelete) {
        console.log(`  - ${duplicate._id} (created: ${duplicate.createdAt})`);
        
        // Merge any unique data from duplicate into the kept violation
        const mergedData = mergeViolations(duplicate, keepViolation, { preferExisting: true });
        
        // Update the kept violation with any merged data
        await Violation.findByIdAndUpdate(keepViolation._id, {
          ...mergedData,
          updated_by: duplicate.created_by // Preserve who contributed data
        });
        
        // Delete the duplicate
        await Violation.findByIdAndDelete(duplicate._id);
      }
      
      console.log(`✅ Cleaned up ${duplicatesToDelete.length} duplicates for violation ${keepViolation._id}`);
    }
    
    console.log(`\n🎉 Cleanup completed! Processed ${duplicateGroups.length} duplicate groups.`);
    
    // Generate content_hash for existing violations that don't have it
    console.log('\n=== Generating content_hash for existing violations ===');
    
    const violationsWithoutHash = await Violation.find({ content_hash: { $exists: false } });
    console.log(`Found ${violationsWithoutHash.length} violations without content_hash`);
    
    for (const violation of violationsWithoutHash) {
      try {
        // Save will trigger the pre-save hook to generate content_hash
        await violation.save();
      } catch (error) {
        if (error.code === 11000) {
          // Duplicate content_hash - this means there's still a duplicate
          console.log(`⚠️  Found additional duplicate: ${violation._id} - deleting`);
          await Violation.findByIdAndDelete(violation._id);
        } else {
          console.error(`Error updating violation ${violation._id}:`, error.message);
        }
      }
    }
    
    console.log('✅ Content hash generation completed');
    
  } catch (error) {
    console.error('Error during cleanup:', error);
  } finally {
    await mongoose.connection.close();
    console.log('Database connection closed');
  }
}

// Run the cleanup
if (require.main === module) {
  cleanupRaceConditionDuplicates();
}

module.exports = { cleanupRaceConditionDuplicates }; 