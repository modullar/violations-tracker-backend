const mongoose = require('mongoose');
const Violation = require('../models/Violation');
const stringSimilarity = require('string-similarity');
const path = require('path');

// Load the appropriate .env file based on NODE_ENV
const envFile = process.env.NODE_ENV === 'staging' ? '.env.staging' : '.env';
require('dotenv').config({ path: path.resolve(__dirname, '..', '..', envFile) });

// Configuration
const SIMILARITY_THRESHOLD = 0.75; // Adjust this value based on your needs (0-1)
const MAX_DISTANCE_METERS = 100; // Maximum distance between coordinates to consider as same location

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

async function findDuplicateViolations() {
  try {
    // Connect to MongoDB
    console.log('Current environment:', process.env.NODE_ENV);
    console.log('Using MongoDB URI:', process.env.MONGO_URI ? 'URI is set' : 'URI is not set');
    
    await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });

    console.log('Connected to MongoDB');

    // Get all violations
    const violations = await Violation.find({}).lean();
    console.log(`Found ${violations.length} total violations`);

    // Find duplicates by comparing all violations
    const duplicates = [];
    for (let i = 0; i < violations.length; i++) {
      for (let j = i + 1; j < violations.length; j++) {
        const v1 = violations[i];
        const v2 = violations[j];
        
        // Check if they match on key fields
        const sameType = v1.type === v2.type;
        const sameDate = compareDates(v1.date, v2.date);
        const samePerpetrator = v1.perpetrator_affiliation === v2.perpetrator_affiliation;
        
        // Check if coordinates are within 10 meters
        let distance = Infinity;
        let nearbyLocation = false;
        if (v1.location.coordinates && v2.location.coordinates) {
          const [lon1, lat1] = v1.location.coordinates;
          const [lon2, lat2] = v2.location.coordinates;
          distance = calculateDistance(lat1, lon1, lat2, lon2);
          nearbyLocation = distance <= MAX_DISTANCE_METERS;
        }

        // Check casualties match
        const sameCasualties = JSON.stringify(v1.casualties) === JSON.stringify(v2.casualties);
        
        // Calculate description similarity
        const similarity = stringSimilarity.compareTwoStrings(
          v1.description.en,
          v2.description.en
        );

        // If they match on key fields OR have high description similarity
        if ((sameType && sameDate && samePerpetrator && nearbyLocation && sameCasualties) || similarity >= SIMILARITY_THRESHOLD) {
          duplicates.push({
            violation1: v1,
            violation2: v2,
            similarity: similarity,
            exactMatch: sameType && sameDate && samePerpetrator && nearbyLocation && sameCasualties,
            matchDetails: {
              sameType,
              sameDate,
              samePerpetrator,
              distance,
              nearbyLocation,
              sameCasualties
            }
          });
        }
      }
    }

    console.log(`Found ${duplicates.length} pairs of potential duplicates`);

    // Process duplicates
    const processedIds = new Set();
    for (const duplicate of duplicates) {
      const { violation1, violation2, similarity, exactMatch, matchDetails } = duplicate;

      // Skip if either violation has already been processed
      if (processedIds.has(violation1._id.toString()) || processedIds.has(violation2._id.toString())) {
        continue;
      }

      console.log('\nDetailed comparison of potential duplicates:');
      console.log('----------------------------------------');
      console.log('Violation 1:');
      console.log(`ID: ${violation1._id}`);
      console.log(`Type: ${violation1.type}`);
      console.log(`Date: ${violation1.date}`);
      console.log(`Location (EN): ${violation1.location.name.en}`);
      console.log(`Location (AR): ${violation1.location.name.ar}`);
      console.log(`Coordinates: ${violation1.location.coordinates}`);
      console.log(`Perpetrator: ${violation1.perpetrator_affiliation}`);
      console.log(`Casualties: ${JSON.stringify(violation1.casualties, null, 2)}`);
      console.log(`Description: ${violation1.description.en}`);
      console.log(`Created At: ${violation1.createdAt}`);
      console.log(`Updated At: ${violation1.updatedAt}`);
      console.log(`Verified: ${violation1.verified}`);
      console.log('----------------------------------------');
      console.log('Violation 2:');
      console.log(`ID: ${violation2._id}`);
      console.log(`Type: ${violation2.type}`);
      console.log(`Date: ${violation2.date}`);
      console.log(`Location (EN): ${violation2.location.name.en}`);
      console.log(`Location (AR): ${violation2.location.name.ar}`);
      console.log(`Coordinates: ${violation2.location.coordinates}`);
      console.log(`Perpetrator: ${violation2.perpetrator_affiliation}`);
      console.log(`Casualties: ${JSON.stringify(violation2.casualties, null, 2)}`);
      console.log(`Description: ${violation2.description.en}`);
      console.log(`Created At: ${violation2.createdAt}`);
      console.log(`Updated At: ${violation2.updatedAt}`);
      console.log(`Verified: ${violation2.verified}`);
      console.log('----------------------------------------');
      console.log('Match Details:');
      console.log(`- Same Type: ${matchDetails.sameType}`);
      console.log(`- Same Date: ${matchDetails.sameDate}`);
      console.log(`- Same Perpetrator: ${matchDetails.samePerpetrator}`);
      console.log(`- Distance between coordinates: ${matchDetails.distance.toFixed(2)} meters`);
      console.log(`- Nearby Location: ${matchDetails.nearbyLocation}`);
      console.log(`- Same Casualties: ${matchDetails.sameCasualties}`);
      console.log(`Similarity: ${(similarity * 100).toFixed(2)}%`);
      console.log(`Exact Match: ${exactMatch ? 'Yes' : 'No'}`);
      console.log('----------------------------------------');

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

      console.log('\nAction taken:');
      console.log(`Kept: ${keepViolation._id} (${keepViolation.type} on ${keepViolation.date})`);
      console.log(`Deleted: ${deleteViolation._id}`);
      console.log('----------------------------------------\n');
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