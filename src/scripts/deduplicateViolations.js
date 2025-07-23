/* eslint-disable quotes */
const mongoose = require('mongoose');
const Violation = require('../models/Violation');
const stringSimilarity = require('string-similarity');
const path = require('path');

// Load the appropriate .env file based on NODE_ENV
let envFile = '.env';
if (process.env.NODE_ENV === 'staging') {
  envFile = '.env.staging';
} else if (process.env.NODE_ENV === 'production') {
  envFile = '.env.production';
} else if (process.env.NODE_ENV === 'development') {
  envFile = '.env.development';
}
require('dotenv').config({ path: path.resolve(__dirname, '..', '..', envFile) });

// CONSERVATIVE CONFIGURATION - Much stricter thresholds
const CONFIG = {
  // Scoring weights for different criteria (must add up to 1.0)
  WEIGHTS: {
    TYPE: 0.30,           // Same violation type
    TIME: 0.20,           // Time proximity
    LOCATION: 0.20,       // Location proximity
    PERPETRATOR: 0.10,    // Same perpetrator
    CASUALTIES: 0.10,     // Similar casualties
    DESCRIPTION: 0.10     // Description similarity
  },
  
  // More balanced thresholds for better Arabic text handling
  SIMILARITY_THRESHOLD: 0.85,     // Reduced from 95% to 85% for better recall
  MAX_DISTANCE_KM: 5,             // Increased to 5km for same village/area
  TIME_WINDOW_HOURS: 24,          // Increased to 24 hours for same day events
  MIN_DESCRIPTION_SIMILARITY: 0.5, // Reduced to 50% for better Arabic text matching
  CASUALTY_TOLERANCE: 0.3,        // Reduced to 30% tolerance for casualty differences
  
  // Safety limits (more conservative)
  MAX_DELETIONS_PER_RUN: 25,      // Reduced limit to prevent mass deletions
  MIN_TOTAL_VIOLATIONS: 50,       // Don't run if less than 50 total violations
  DRY_RUN: false                  // ENABLED: Will actually merge duplicates
};

// Calculate distance between two points using Haversine formula
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth's radius in kilometers
  const φ1 = lat1 * Math.PI/180;
  const φ2 = lat2 * Math.PI/180;
  const Δφ = (lat2-lat1) * Math.PI/180;
  const Δλ = (lon2-lon1) * Math.PI/180;

  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
          Math.cos(φ1) * Math.cos(φ2) *
          Math.sin(Δλ/2) * Math.sin(Δλ/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

  return R * c; // Distance in kilometers
}

// Calculate time difference in hours
function calculateTimeDifference(date1, date2) {
  const d1 = new Date(date1);
  const d2 = new Date(date2);
  return Math.abs(d2 - d1) / (1000 * 60 * 60); // Hours
}

// Calculate casualty similarity
function calculateCasualtySimilarity(casualties1, casualties2) {
  if (!casualties1 || !casualties2) return 0;
  
  const total1 = (casualties1.killed || 0) + (casualties1.injured || 0);
  const total2 = (casualties2.killed || 0) + (casualties2.injured || 0);
  
  if (total1 === 0 && total2 === 0) return 1;
  if (total1 === 0 || total2 === 0) return 0;
  
  const difference = Math.abs(total1 - total2);
  const maxTotal = Math.max(total1, total2);
  
  return Math.max(0, 1 - (difference / maxTotal));
}

// Improved description similarity that handles subset/summary cases
function calculateDescriptionSimilarity(desc1, desc2) {
  if (!desc1 || !desc2) return 0;
  
  // Basic string similarity
  const basicSimilarity = stringSimilarity.compareTwoStrings(desc1, desc2);
  
  // Extract key information from descriptions
  const extractKeyInfo = (text) => {
    const normalized = text.toLowerCase()
      .replace(/[^\w\s]/g, ' ')  // Remove punctuation
      .replace(/\s+/g, ' ')      // Normalize spaces
      .trim();
    
    const words = normalized.split(' ');
    
    // Filter out common words and keep important ones (including Arabic common words)
    const commonWords = [
      // English common words
      'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'from', 'up', 'about', 'into', 'through', 'during', 'before', 'after', 'above', 'below', 'between', 'among', 'within', 'without', 'against', 'across', 'beside', 'beyond', 'under', 'over', 'around', 'near', 'far', 'inside', 'outside', 'behind', 'front', 'next', 'last', 'first', 'second', 'third', 'fourth', 'fifth', 'carried', 'out', 'areas', 'targeting',
      // Arabic common words
      'في', 'من', 'إلى', 'على', 'عن', 'مع', 'بعد', 'قبل', 'أثناء', 'خلال', 'ضد', 'نحو', 'حول', 'دون', 'سوى', 'غير', 'كل', 'بعض', 'جميع', 'كان', 'كانت', 'يكون', 'تكون', 'هذا', 'هذه', 'ذلك', 'تلك', 'التي', 'الذي', 'التي', 'الذين', 'اللذان', 'اللتان', 'اللواتي', 'اللاتي'
    ];
    
    const importantWords = words.filter(word => 
      word.length > 2 && !commonWords.includes(word)
    );
    
    return {
      words: importantWords,
      wordSet: new Set(importantWords)
    };
  };
  
  const info1 = extractKeyInfo(desc1);
  const info2 = extractKeyInfo(desc2);
  
  // Calculate word overlap
  const intersection = info1.words.filter(word => info2.wordSet.has(word));
  const union = new Set([...info1.words, ...info2.words]);
  
  const wordOverlap = intersection.length / Math.min(info1.words.length, info2.words.length);
  const jaccardSimilarity = intersection.length / union.size;
  
  // Check if one description contains the essence of another
  const containmentScore1 = intersection.length / info1.words.length;
  const containmentScore2 = intersection.length / info2.words.length;
  const maxContainment = Math.max(containmentScore1, containmentScore2);
  
  // If one description is much shorter and most of its words are in the other,
  // it's likely a summary
  const lengthRatio = Math.min(desc1.length, desc2.length) / Math.max(desc1.length, desc2.length);
  const isSummaryCase = lengthRatio < 0.7 && maxContainment > 0.8;
  
  // Combine different similarity measures
  let finalSimilarity = Math.max(
    basicSimilarity,
    wordOverlap,
    jaccardSimilarity,
    isSummaryCase ? maxContainment : 0
  );
  
  // Boost similarity if we detect a clear summary/subset relationship
  if (isSummaryCase && wordOverlap > 0.6) {
    finalSimilarity = Math.min(1.0, finalSimilarity + 0.2);
  }
  
  return finalSimilarity;
}

// Calculate comprehensive similarity score
function calculateSimilarityScore(v1, v2) {
  const score = {
    type: 0,
    time: 0,
    location: 0,
    perpetrator: 0,
    casualties: 0,
    description: 0,
    total: 0,
    details: {}
  };

  // Type similarity (exact match required)
  score.type = (v1.type === v2.type) ? 1 : 0;
  score.details.sameType = v1.type === v2.type;

  // Time similarity
  const timeDiff = calculateTimeDifference(v1.date, v2.date);
  score.time = timeDiff <= CONFIG.TIME_WINDOW_HOURS ? 1 : 0;
  score.details.timeDiffHours = timeDiff;
  score.details.withinTimeWindow = timeDiff <= CONFIG.TIME_WINDOW_HOURS;

  // Location similarity
  let distance = Infinity;
  let locationSimilarity = 0;
  
  if (v1.location.coordinates && v2.location.coordinates) {
    // Both have coordinates - use distance calculation
    const [lon1, lat1] = v1.location.coordinates;
    const [lon2, lat2] = v2.location.coordinates;
    distance = calculateDistance(lat1, lon1, lat2, lon2);
    locationSimilarity = distance <= CONFIG.MAX_DISTANCE_KM ? 1 : 0;
  } else if (v1.location.name && v2.location.name) {
    // No coordinates but have location names - use name similarity
    const name1 = v1.location.name.en || v1.location.name.ar || '';
    const name2 = v2.location.name.en || v2.location.name.ar || '';
    
    // Check for exact match or high similarity
    if (name1.toLowerCase() === name2.toLowerCase()) {
      locationSimilarity = 1;
      distance = 0; // Same location name = 0 distance
    } else {
      // Calculate text similarity for location names
      const nameSimilarity = stringSimilarity.compareTwoStrings(name1.toLowerCase(), name2.toLowerCase());
      locationSimilarity = nameSimilarity >= 0.8 ? 1 : 0; // 80% name similarity = same location
      distance = nameSimilarity >= 0.8 ? 1 : Infinity; // Close but not exact
    }
  }
  
  score.location = locationSimilarity;
  score.details.distanceKm = distance;
  score.details.withinLocationRadius = locationSimilarity === 1;

  // Perpetrator similarity (case-insensitive)
  const perp1 = (v1.perpetrator_affiliation || '').toLowerCase();
  const perp2 = (v2.perpetrator_affiliation || '').toLowerCase();
  score.perpetrator = (perp1 === perp2) ? 1 : 0;
  score.details.samePerpetrator = perp1 === perp2;

  // Casualty similarity (handle undefined/null gracefully)
  const casualties1 = v1.casualties || v1.casualties_count || 0;
  const casualties2 = v2.casualties || v2.casualties_count || 0;
  
  if (casualties1 === 0 && casualties2 === 0) {
    // Both have no casualties - perfect match
    score.casualties = 1;
  } else if (casualties1 === 0 || casualties2 === 0) {
    // One has casualties, one doesn't - partial match
    score.casualties = 0.5;
  } else {
    // Both have casualties - use detailed calculation
    score.casualties = calculateCasualtySimilarity(casualties1, casualties2);
  }
  
  score.details.casualtySimilarity = score.casualties;

  // Description similarity - try English first, fall back to Arabic
  let descriptionSimilarity = 0;
  
  if (v1.description?.en && v2.description?.en) {
    // Both have English descriptions - use English
    descriptionSimilarity = calculateDescriptionSimilarity(v1.description.en, v2.description.en);
  } else if (v1.description?.ar && v2.description?.ar) {
    // Both have Arabic descriptions - use Arabic
    descriptionSimilarity = calculateDescriptionSimilarity(v1.description.ar, v2.description.ar);
  } else if (v1.description?.en && v2.description?.ar) {
    // Cross-language comparison - lower weight
    descriptionSimilarity = calculateDescriptionSimilarity(v1.description.en, v2.description.ar) * 0.7;
  } else if (v1.description?.ar && v2.description?.en) {
    // Cross-language comparison - lower weight
    descriptionSimilarity = calculateDescriptionSimilarity(v1.description.ar, v2.description.en) * 0.7;
  }
  
  score.description = descriptionSimilarity;
  score.details.descriptionSimilarity = descriptionSimilarity;

  // Calculate weighted total score
  score.total = (
    score.type * CONFIG.WEIGHTS.TYPE +
    score.time * CONFIG.WEIGHTS.TIME +
    score.location * CONFIG.WEIGHTS.LOCATION +
    score.perpetrator * CONFIG.WEIGHTS.PERPETRATOR +
    score.casualties * CONFIG.WEIGHTS.CASUALTIES +
    score.description * CONFIG.WEIGHTS.DESCRIPTION
  );

  return score;
}

// Validate if two violations are truly duplicates
function validateDuplicate(v1, v2, score) {
  // Core criteria that must match
  const essentialCriteria = [
    score.details.sameType,
    score.details.withinTimeWindow,
    score.details.withinLocationRadius
  ];

  const meetsEssential = essentialCriteria.every(req => req === true);
  
  // If all essential criteria match perfectly, we can be more lenient with description
  const strongMatch = meetsEssential && score.details.samePerpetrator;
  
  // Description similarity requirements (more lenient for strong matches)
  const descriptionOk = strongMatch ? 
    score.details.descriptionSimilarity >= 0.4 :  // More lenient for strong location/time/type matches
    score.details.descriptionSimilarity >= CONFIG.MIN_DESCRIPTION_SIMILARITY;

  const meetsCore = meetsEssential && descriptionOk;
  const meetsThreshold = score.total >= CONFIG.SIMILARITY_THRESHOLD;

  return meetsCore && meetsThreshold;
}

// Group violations into clusters of potential duplicates
function clusterViolations(violations) {
  const clusters = [];
  const processed = new Set();

  for (let i = 0; i < violations.length; i++) {
    if (processed.has(i)) continue;

    const cluster = [violations[i]];
    processed.add(i);

    for (let j = i + 1; j < violations.length; j++) {
      if (processed.has(j)) continue;

      const score = calculateSimilarityScore(violations[i], violations[j]);
      if (validateDuplicate(violations[i], violations[j], score)) {
        cluster.push(violations[j]);
        processed.add(j);
      }
    }

    if (cluster.length > 1) {
      clusters.push(cluster);
    }
  }

  return clusters;
}

// Select the best violation from a cluster
function selectBestViolation(cluster) {
  // Priority: verified > longer description > more recent > more complete data
  return cluster.sort((a, b) => {
    // Verified violations take priority
    if (a.verified && !b.verified) return -1;
    if (!a.verified && b.verified) return 1;
    
    // Longer descriptions are preferred (more detail)
    const descA = a.description?.en || a.description?.ar || '';
    const descB = b.description?.en || b.description?.ar || '';
    if (descA.length !== descB.length) {
      return descB.length - descA.length; // Longer description first
    }
    
    // More recent violations are preferred
    const dateA = new Date(a.updatedAt || a.createdAt);
    const dateB = new Date(b.updatedAt || b.createdAt);
    if (dateA > dateB) return -1;
    if (dateA < dateB) return 1;
    
    // More complete data (more fields filled)
    const completenessA = (a.victims?.length || 0) + (a.media_links?.length || 0) + (a.tags?.length || 0);
    const completenessB = (b.victims?.length || 0) + (b.media_links?.length || 0) + (b.tags?.length || 0);
    return completenessB - completenessA;
  })[0];
}

// Smart merge function to combine data from duplicates
function smartMerge(keepViolation, duplicates) {
  const merged = { ...keepViolation };

  for (const duplicate of duplicates) {
    // Merge victims
    if (duplicate.victims && duplicate.victims.length > 0) {
      const existingVictimIds = new Set((merged.victims || []).map(v => v._id?.toString()));
      const newVictims = duplicate.victims.filter(v => !existingVictimIds.has(v._id?.toString()));
      merged.victims = [...(merged.victims || []), ...newVictims];
    }

    // Merge media links
    if (duplicate.media_links && duplicate.media_links.length > 0) {
      const existingLinks = new Set(merged.media_links || []);
      const newLinks = duplicate.media_links.filter(link => !existingLinks.has(link));
      merged.media_links = [...(merged.media_links || []), ...newLinks];
    }

    // Merge tags
    if (duplicate.tags && duplicate.tags.length > 0) {
      const existingTags = new Set((merged.tags || []).map(t => t.en));
      const newTags = duplicate.tags.filter(t => !existingTags.has(t.en));
      merged.tags = [...(merged.tags || []), ...newTags];
    }

    // Use higher casualty count if available
    if (duplicate.casualties) {
      const currentTotal = (merged.casualties?.killed || 0) + (merged.casualties?.injured || 0);
      const duplicateTotal = (duplicate.casualties.killed || 0) + (duplicate.casualties.injured || 0);
      if (duplicateTotal > currentTotal) {
        merged.casualties = duplicate.casualties;
      }
    }
  }

  return merged;
}

async function findAndProcessDuplicates() {
  try {
    console.log('🔍 Starting SMART Deduplication Process');
    console.log('=====================================');
    console.log('Current environment:', process.env.NODE_ENV);
    console.log('DRY RUN MODE:', CONFIG.DRY_RUN ? 'ENABLED' : 'DISABLED');
    
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });

    console.log('✅ Connected to MongoDB');

    // Get all violations
    const violations = await Violation.find({}).lean();
    console.log(`📊 Found ${violations.length} total violations`);

    // Safety check - don't run if too few violations
    if (violations.length < CONFIG.MIN_TOTAL_VIOLATIONS) {
      console.log(`⚠️  Safety check failed: Only ${violations.length} violations (minimum ${CONFIG.MIN_TOTAL_VIOLATIONS})`);
      console.log('❌ Aborting to prevent accidental data loss');
      return;
    }

    // Cluster violations into potential duplicate groups
    console.log('🔍 Clustering violations...');
    const clusters = clusterViolations(violations);
    console.log(`📊 Found ${clusters.length} clusters of potential duplicates`);

    if (clusters.length === 0) {
      console.log('✅ No duplicates found - database is clean!');
      return;
    }

    // Process each cluster
    let totalDeletions = 0;
    const deletionPlan = [];

    for (const [index, cluster] of clusters.entries()) {
      console.log(`\n🔬 Analyzing Cluster ${index + 1}/${clusters.length}`);
      console.log('='.repeat(50));
      
      // Select the best violation to keep
      const bestViolation = selectBestViolation(cluster);
      const duplicates = cluster.filter(v => v._id.toString() !== bestViolation._id.toString());
      
      // Check safety limit
      if (totalDeletions + duplicates.length > CONFIG.MAX_DELETIONS_PER_RUN) {
        console.log(`⚠️  Safety limit reached: Would delete ${totalDeletions + duplicates.length} violations`);
        console.log(`📊 Maximum allowed per run: ${CONFIG.MAX_DELETIONS_PER_RUN}`);
        break;
      }

      // Display cluster analysis
      console.log(`📋 Cluster contains ${cluster.length} violations:`);
      cluster.forEach((v, i) => {
        const marker = v._id.toString() === bestViolation._id.toString() ? '👑 KEEP' : '❌ DELETE';
        console.log(`   ${i + 1}. ${marker} ${v._id} - ${v.type} on ${v.date}`);
        console.log(`      Location: ${v.location.name.en}`);
        console.log(`      Description: ${v.description.en.substring(0, 100)}...`);
        console.log(`      Verified: ${v.verified ? 'Yes' : 'No'}`);
      });

      // Calculate similarity scores between violations in cluster
      for (const duplicate of duplicates) {
        const score = calculateSimilarityScore(bestViolation, duplicate);
        console.log(`\n🔍 Similarity Analysis:`);
        console.log(`   Keep: ${bestViolation._id}`);
        console.log(`   Delete: ${duplicate._id}`);
        console.log(`   Overall Score: ${(score.total * 100).toFixed(1)}%`);
        console.log(`   Type Match: ${score.details.sameType ? '✅' : '❌'}`);
        console.log(`   Time Window: ${score.details.withinTimeWindow ? '✅' : '❌'} (${score.details.timeDiffHours.toFixed(1)}h)`);
        console.log(`   Location: ${score.details.withinLocationRadius ? '✅' : '❌'} (${score.details.distanceKm.toFixed(1)}km)`);
        console.log(`   Perpetrator: ${score.details.samePerpetrator ? '✅' : '❌'}`);
        console.log(`   Description: ${(score.details.descriptionSimilarity * 100).toFixed(1)}%`);
        console.log(`   Casualties: ${(score.details.casualtySimilarity * 100).toFixed(1)}%`);
      }

      // Plan the merge and deletion
      const mergedViolation = smartMerge(bestViolation, duplicates);
      
      deletionPlan.push({
        keep: bestViolation._id,
        delete: duplicates.map(d => d._id),
        merged: mergedViolation,
        clusterSize: cluster.length
      });

      totalDeletions += duplicates.length;
    }

    // Execute the plan
    console.log(`\n📋 EXECUTION PLAN`);
    console.log('='.repeat(50));
    console.log(`Total clusters to process: ${deletionPlan.length}`);
    console.log(`Total violations to delete: ${totalDeletions}`);
    console.log(`Total violations to keep: ${deletionPlan.length}`);

    if (CONFIG.DRY_RUN) {
      console.log('🔍 DRY RUN MODE - No actual changes made');
      console.log('To execute for real, set CONFIG.DRY_RUN = false');
    } else {
      console.log('⚠️  EXECUTING REAL CHANGES...');
      
      for (const plan of deletionPlan) {
        // Update the kept violation with merged data
        await Violation.findByIdAndUpdate(plan.keep, plan.merged);
        
        // Delete the duplicates
        for (const deleteId of plan.delete) {
          await Violation.findByIdAndDelete(deleteId);
        }
        
        console.log(`✅ Processed cluster: kept ${plan.keep}, deleted ${plan.delete.length} duplicates`);
      }
    }

    console.log('\n🎉 Deduplication completed successfully!');
    console.log(`📊 Final summary:`);
    console.log(`   - Clusters processed: ${deletionPlan.length}`);
    console.log(`   - Violations deleted: ${totalDeletions}`);
    console.log(`   - Violations remaining: ${violations.length - totalDeletions}`);

  } catch (error) {
    console.error('❌ Error during deduplication:', error);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log('📡 Database connection closed');
  }
}

// Run the script
if (require.main === module) {
  findAndProcessDuplicates();
}

module.exports = { 
  findAndProcessDuplicates, 
  CONFIG,
  calculateSimilarityScore,
  validateDuplicate,
  calculateDescriptionSimilarity,
  selectBestViolation
}; 