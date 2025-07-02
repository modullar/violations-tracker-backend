const mongoose = require('mongoose');
const Violation = require('../models/Violation');
const { mergeViolations } = require('../commands/violations/merge');
const logger = require('../config/logger');
require('dotenv').config();

/**
 * Clean up race condition duplicates by finding truly identical violations
 * and merging them into a single violation
 */
async function cleanupRaceConditionDuplicates() {
  try {
    // Connect to database
    await mongoose.connect(process.env.MONGO_URI);
    logger.info('Connected to MongoDB');

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
    
    logger.info('Found duplicate groups', { count: duplicateGroups.length });
    
    for (const group of duplicateGroups) {
      const violations = group.violations;
      logger.info('Processing duplicate group', {
        type: group._id.type,
        date: group._id.date,
        perpetrator_affiliation: group._id.perpetrator_affiliation,
        coordinates: group._id.coordinates,
        description_preview: group._id.description_en.substring(0, 50),
        count: violations.length
      });
      
      // Sort by creation date to keep the earliest one
      violations.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
      
      const keepViolation = violations[0];
      const duplicatesToDelete = violations.slice(1);
      
      logger.info('Processing violation merge', {
        keepViolationId: keepViolation._id,
        keepViolationCreated: keepViolation.createdAt,
        duplicateCount: duplicatesToDelete.length,
        duplicateIds: duplicatesToDelete.map(d => d._id)
      });
      
      for (const duplicate of duplicatesToDelete) {
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
      
      logger.info('Cleaned up duplicates for violation', {
        violationId: keepViolation._id,
        cleanedCount: duplicatesToDelete.length
      });
    }
    
    logger.info('Cleanup completed', { processedGroups: duplicateGroups.length });
    
    // Generate content_hash for existing violations that don't have it
    logger.info('Generating content_hash for existing violations');
    
    const violationsWithoutHash = await Violation.find({ content_hash: { $exists: false } });
    logger.info('Found violations without content_hash', { count: violationsWithoutHash.length });
    
    for (const violation of violationsWithoutHash) {
      try {
        // Save will trigger the pre-save hook to generate content_hash
        await violation.save();
      } catch (error) {
        if (error.code === 11000) {
          // Duplicate content_hash - this means there's still a duplicate
          logger.warn('Found additional duplicate violation, deleting', {
            violationId: violation._id
          });
          await Violation.findByIdAndDelete(violation._id);
        } else {
          logger.error('Error updating violation', {
            violationId: violation._id,
            error: error.message
          });
        }
      }
    }
    
    logger.info('Content hash generation completed');
    
  } catch (error) {
    logger.error('Error during cleanup', { error: error.message, stack: error.stack });
  } finally {
    await mongoose.connection.close();
    logger.info('Database connection closed');
  }
}

// Run the cleanup
if (require.main === module) {
  cleanupRaceConditionDuplicates();
}

module.exports = { cleanupRaceConditionDuplicates }; 