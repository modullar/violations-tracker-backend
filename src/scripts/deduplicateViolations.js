const mongoose = require('mongoose');
const Violation = require('../models/Violation');
const stringSimilarity = require('string-similarity');
require('dotenv').config();

// Configuration
const SIMILARITY_THRESHOLD = 0.8; // Adjust this value based on your needs (0-1)

async function findDuplicateViolations() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });

    console.log('Connected to MongoDB');

    // Get all violations
    const violations = await Violation.find({}).lean();
    console.log(`Found ${violations.length} total violations`);

    // Group violations by key fields
    const groupedViolations = {};
    violations.forEach(violation => {
      const groupKey = `${violation.type}-${violation.date}-${violation.perpetrator_affiliation}-${violation.location.name.en}`;
      if (!groupedViolations[groupKey]) {
        groupedViolations[groupKey] = [];
      }
      groupedViolations[groupKey].push(violation);
    });

    // Find duplicates within each group
    const duplicates = [];
    for (const group of Object.values(groupedViolations)) {
      if (group.length > 1) {
        // Compare descriptions for similarity
        for (let i = 0; i < group.length; i++) {
          for (let j = i + 1; j < group.length; j++) {
            const similarity = stringSimilarity.compareTwoStrings(
              group[i].description.en,
              group[j].description.en
            );

            if (similarity >= SIMILARITY_THRESHOLD) {
              duplicates.push({
                violation1: group[i],
                violation2: group[j],
                similarity: similarity
              });
            }
          }
        }
      }
    }

    console.log(`Found ${duplicates.length} pairs of potential duplicates`);

    // Process duplicates
    const processedIds = new Set();
    for (const duplicate of duplicates) {
      const { violation1, violation2, similarity } = duplicate;

      // Skip if either violation has already been processed
      if (processedIds.has(violation1._id.toString()) || processedIds.has(violation2._id.toString())) {
        continue;
      }

      // Determine which violation to keep (prefer verified ones, then more recent ones)
      let keepViolation, deleteViolation;
      if (violation1.verified && !violation2.verified) {
        keepViolation = violation1;
        deleteViolation = violation2;
      } else if (!violation1.verified && violation2.verified) {
        keepViolation = violation2;
        deleteViolation = violation1;
      } else {
        // If both have same verification status, keep the more recent one
        keepViolation = new Date(violation1.updatedAt) > new Date(violation2.updatedAt) ? violation1 : violation2;
        deleteViolation = keepViolation === violation1 ? violation2 : violation1;
      }

      // Merge any unique information from the deleted violation into the kept one
      const mergedViolation = { ...keepViolation };

      // Merge victims if they exist
      if (deleteViolation.victims && deleteViolation.victims.length > 0) {
        const existingVictimIds = new Set(keepViolation.victims.map(v => v._id));
        const newVictims = deleteViolation.victims.filter(v => !existingVictimIds.has(v._id));
        mergedViolation.victims = [...keepViolation.victims, ...newVictims];
      }

      // Merge media links
      if (deleteViolation.media_links && deleteViolation.media_links.length > 0) {
        const existingMediaLinks = new Set(keepViolation.media_links);
        const newMediaLinks = deleteViolation.media_links.filter(link => !existingMediaLinks.has(link));
        mergedViolation.media_links = [...keepViolation.media_links, ...newMediaLinks];
      }

      // Merge tags
      if (deleteViolation.tags && deleteViolation.tags.length > 0) {
        const existingTags = new Set(keepViolation.tags.map(t => t.en));
        const newTags = deleteViolation.tags.filter(t => !existingTags.has(t.en));
        mergedViolation.tags = [...keepViolation.tags, ...newTags];
      }

      // Update the kept violation and delete the duplicate
      await Violation.findByIdAndUpdate(keepViolation._id, mergedViolation);
      await Violation.findByIdAndDelete(deleteViolation._id);

      processedIds.add(keepViolation._id.toString());
      processedIds.add(deleteViolation._id.toString());

      console.log(`Merged and deleted duplicate violations:
        Kept: ${keepViolation._id} (${keepViolation.type} on ${keepViolation.date})
        Deleted: ${deleteViolation._id}
        Similarity: ${similarity}`);
    }

    console.log('Deduplication process completed');
    await mongoose.connection.close();
  } catch (error) {
    console.error('Error during deduplication:', error);
    process.exit(1);
  }
}

// Run the script
findDuplicateViolations(); 