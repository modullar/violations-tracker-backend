module.exports = {
  async up(db) {
    try {
      // Find violations with descriptions containing landmine-related terms
      const landminePattern = /landmine|mine|war remnants|مخلفات حرب|لغم/i;
      
      const violations = await db.collection('violations').find({
        $or: [
          { 'description.en': { $regex: landminePattern } },
          { 'description.ar': { $regex: landminePattern } }
        ]
      }).toArray();

      console.log(`Found ${violations.length} potential landmine violations to update`);

      // Update each violation
      for (const violation of violations) {
        await db.collection('violations').updateOne(
          { _id: violation._id },
          {
            $set: {
              type: 'LANDMINE',
              perpetrator: {
                en: 'Landmine/War remnants',
                ar: 'مخلفات حرب/لغم'
              },
              perpetrator_affiliation: violation.perpetrator_affiliation || 'unknown'
            }
          }
        );
        console.log(`Updated violation ${violation._id}`);
      }

      console.log('Migration completed successfully');
    } catch (error) {
      console.error('Migration failed:', error);
      throw error;
    }
  },

  async down(db) {
    // Revert the changes if needed
    try {
      const violations = await db.collection('violations').find({
        type: 'LANDMINE',
        'perpetrator.en': 'Landmine/War remnants'
      }).toArray();

      console.log(`Found ${violations.length} landmine violations to revert`);

      for (const violation of violations) {
        // Store the original type and perpetrator info before reverting
        await db.collection('violations').updateOne(
          { _id: violation._id },
          {
            $set: {
              type: 'OTHER', // Revert to OTHER type
              perpetrator: {
                en: 'Unknown',
                ar: 'غير معروف'
              }
            }
          }
        );
        console.log(`Reverted violation ${violation._id}`);
      }

      console.log('Revert completed successfully');
    } catch (error) {
      console.error('Revert failed:', error);
      throw error;
    }
  }
}; 