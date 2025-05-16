const { ObjectId } = require('mongodb');

module.exports = {
  /**
   * @param db {import('mongodb').Db}
   * @returns {Promise<void>}
   */
  async up(db) {
    const excludedIds = [
      new ObjectId('682726736d25823bcfd6b635'),
      new ObjectId('682726736d25823bcfd6b636'),
      new ObjectId('682726736d25823bcfd6b637'),
      new ObjectId('682726736d25823bcfd6b638'),
      new ObjectId('682726736d25823bcfd6b639'),
      new ObjectId('682726736d25823bcfd6b63a'),
      new ObjectId('682726736d25823bcfd6b63b')
    ];

    // Get all violations with the target date
    const violations = await db.collection('violations').find({
      date: new Date('2025-05-15'),
      _id: { $nin: excludedIds }
    }).toArray();

    console.log(`Found ${violations.length} violations to update`);

    let updatedCount = 0;

    // Update each violation
    for (const violation of violations) {
      await db.collection('violations').updateOne(
        { _id: violation._id },
        {
          $set: {
            date: new Date('2025-05-14'),
            updatedAt: new Date()
          }
        }
      );
      updatedCount++;
    }

    console.log(`Successfully updated ${updatedCount} violations`);
  },

  /**
   * @param db {import('mongodb').Db}
   * @returns {Promise<void>}
   */
  async down(db) {
    const excludedIds = [
      new ObjectId('682726736d25823bcfd6b635'),
      new ObjectId('682726736d25823bcfd6b636'),
      new ObjectId('682726736d25823bcfd6b637'),
      new ObjectId('682726736d25823bcfd6b638'),
      new ObjectId('682726736d25823bcfd6b639'),
      new ObjectId('682726736d25823bcfd6b63a'),
      new ObjectId('682726736d25823bcfd6b63b')
    ];

    // Get all violations with the target date
    const violations = await db.collection('violations').find({
      date: new Date('2025-05-14'),
      _id: { $nin: excludedIds }
    }).toArray();

    console.log(`Found ${violations.length} violations to revert`);

    let updatedCount = 0;

    // Update each violation
    for (const violation of violations) {
      await db.collection('violations').updateOne(
        { _id: violation._id },
        {
          $set: {
            date: new Date('2025-05-15'),
            updatedAt: new Date()
          }
        }
      );
      updatedCount++;
    }

    console.log(`Successfully reverted ${updatedCount} violations`);
  }
}; 