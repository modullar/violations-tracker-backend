

module.exports = {
  /**
   * @param db {import('mongodb').Db}
   * @returns {Promise<void>}
   */
  async up(db) {
    console.log('Starting source_urls migration...');
    
    // Find all violations that have source_url but no source_urls
    const violations = await db.collection('violations').find({
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
    }).toArray();
    
    console.log(`Found ${violations.length} violations to migrate`);
    
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
        
        await db.collection('violations').updateOne(
          { _id: violation._id },
          { 
            $set: { source_urls: uniqueUrls },
            $unset: { source_url: 1 }
          }
        );
        
        migratedCount++;
        console.log(`Migrated violation ${violation._id}: ${uniqueUrls.length} URLs`);
      } else {
        // If no valid URLs found, set a default empty array
        await db.collection('violations').updateOne(
          { _id: violation._id },
          { 
            $set: { source_urls: [] },
            $unset: { source_url: 1 }
          }
        );
        
        skippedCount++;
        console.log(`No valid URLs found for violation ${violation._id}, set empty array`);
      }
    }
    
    console.log(`Migration completed: ${migratedCount} violations migrated, ${skippedCount} violations with no URLs`);
    
    // Verify migration
    const remainingViolations = await db.collection('violations').find({
      $or: [
        { 'source_url.en': { $exists: true, $ne: '' } },
        { 'source_url.ar': { $exists: true, $ne: '' } }
      ]
    }).toArray();
    
    if (remainingViolations.length > 0) {
      console.log(`Warning: ${remainingViolations.length} violations still have source_url field`);
    } else {
      console.log('All violations successfully migrated');
    }
  },

  /**
   * @param db {import('mongodb').Db}
   * @returns {Promise<void>}
   */
  async down(db) {
    console.log('Starting source_urls migration rollback...');
    
    // Find all violations that have source_urls but no source_url
    const violations = await db.collection('violations').find({
      $and: [
        { source_urls: { $exists: true } },
        {
          $or: [
            { source_url: { $exists: false } },
            { source_url: null }
          ]
        }
      ]
    }).toArray();
    
    console.log(`Found ${violations.length} violations to rollback`);
    
    let rollbackCount = 0;
    
    for (const violation of violations) {
      // Convert source_urls back to source_url format
      const sourceUrl = {
        en: violation.source_urls && violation.source_urls.length > 0 ? violation.source_urls[0] : '',
        ar: violation.source_urls && violation.source_urls.length > 1 ? violation.source_urls[1] : ''
      };
      
      await db.collection('violations').updateOne(
        { _id: violation._id },
        { 
          $set: { source_url: sourceUrl },
          $unset: { source_urls: 1 }
        }
      );
      
      rollbackCount++;
      console.log(`Rolled back violation ${violation._id}`);
    }
    
    console.log(`Rollback completed: ${rollbackCount} violations rolled back`);
  }
}; 