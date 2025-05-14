const mongoose = require('mongoose');
const Violation = require('../models/Violation');
require('dotenv').config();

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log(`MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error('Error connecting to MongoDB:', error);
    process.exit(1);
  }
};

const updateLandmineViolations = async () => {
  try {
    // Find violations with descriptions containing landmine-related terms
    const landminePattern = /landmine|mine|war remnants|مخلفات حرب|لغم/i;
    
    const violations = await Violation.find({
      $or: [
        { 'description.en': { $regex: landminePattern } },
        { 'description.ar': { $regex: landminePattern } }
      ]
    });

    console.log(`Found ${violations.length} potential landmine violations to update`);

    // Update each violation
    for (const violation of violations) {
      // Update type to LANDMINE
      violation.type = 'LANDMINE';
      
      // Update perpetrator information
      violation.perpetrator = {
        en: 'Landmine/War remnants',
        ar: 'مخلفات حرب/لغم'
      };
      
      // Set perpetrator affiliation to unknown if not already set
      if (!violation.perpetrator_affiliation) {
        violation.perpetrator_affiliation = 'unknown';
      }

      await violation.save();
      console.log(`Updated violation ${violation._id}`);
    }

    console.log('Migration completed successfully');
  } catch (error) {
    console.error('Migration failed:', error);
    throw error;
  } finally {
    // Close the database connection
    await mongoose.connection.close();
  }
};

// Run the migration
const runMigration = async () => {
  try {
    await connectDB();
    await updateLandmineViolations();
    console.log('Migration completed');
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
};

runMigration(); 