module.exports = {
  /**
   * @param db {import('mongodb').Db}
   * @returns {Promise<void>}
   */
  async up(db) {
    // Mapping of old to new perpetrator affiliations
    const affiliationMapping = {
      'government': 'assad_regime',
      'rebel group': 'various_armed_groups',
      'terrorist group': 'isis',
      'military': 'assad_regime',
      'other': 'various_armed_groups',
      'unknown': 'unknown'
    };

    // Arabic translations for the new values
    const arabicTranslations = {
      'assad_regime': 'نظام الأسد',
      'post_8th_december_government': 'الحكومة الانتقالية المؤقتة و حلفائها',
      'various_armed_groups': 'مجموعات مسلحة متنوعة',
      'isis': 'داعش',
      'sdf': 'قوات سوريا الديمقراطية',
      'israel': 'إسرائيل',
      'unknown': 'غير معروف'
    };

    // Get all violations
    const violations = await db.collection('violations').find({}).toArray();
    console.log(`Found ${violations.length} violations to update`);
    
    let updatedCount = 0;
    
    // Update each violation
    for (const violation of violations) {
      if (violation.perpetrator_affiliation && violation.perpetrator_affiliation.en) {
        const oldAffiliation = violation.perpetrator_affiliation.en.toLowerCase();
        const newAffiliation = affiliationMapping[oldAffiliation] || 'unknown';
        
        // Update the affiliation
        await db.collection('violations').updateOne(
          { _id: violation._id },
          { 
            $set: { 
              perpetrator_affiliation: {
                en: newAffiliation,
                ar: arabicTranslations[newAffiliation] || 'غير معروف'
              }
            } 
          }
        );
        
        updatedCount++;
      }
    }
    
    console.log(`Successfully updated ${updatedCount} violations with new perpetrator affiliations`);
  },

  /**
   * @returns {Promise<void>}
   */
  async down() {
    // It's difficult to revert this change precisely since we're mapping multiple values to the same key
    // For safety, we'll just log that manual intervention is needed if a rollback is required
    console.log('This migration cannot be automatically rolled back. Manual intervention is required.');
  }
};
