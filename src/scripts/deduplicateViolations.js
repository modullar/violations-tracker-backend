/* eslint-disable quotes */
/**
 * Smart Deduplication Script for Violations
 * 
 * Features:
 * - Conservative deduplication to minimize false positives
 * - Extended time window (48 hours) for high similarity cases (≥90%)
 * - Advanced false positive detection
 * - Smart merging of duplicate data
 */
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
    TYPE: 0.25,           // Reduced from 0.30 - allow related types
    TIME: 0.20,           // Time proximity
    LOCATION: 0.25,       // Increased from 0.20 - location is crucial
    PERPETRATOR: 0.10,    // Same perpetrator
    CASUALTIES: 0.10,     // Similar casualties
    DESCRIPTION: 0.10     // Description similarity
  },
  
  // Balanced strict thresholds to minimize false positives while catching true duplicates
  SIMILARITY_THRESHOLD: 0.80,     // Balanced at 80% for good precision
  MAX_DISTANCE_KM: 2,             // Balanced at 2km to catch nearby duplicates
  TIME_WINDOW_HOURS: 3,           // Standard 3 hours for tight time window
  EXTENDED_TIME_WINDOW_HOURS: 48, // Extended 48 hours for high similarity cases
  HIGH_SIMILARITY_THRESHOLD: 0.90, // Threshold for extended time window
  MIN_DESCRIPTION_SIMILARITY: 0.35, // Balanced threshold for precision and recall
  CASUALTY_TOLERANCE: 0.3,        // Reduced to 30% tolerance for casualty differences
  
  // Safety limits (more conservative)
  MAX_DELETIONS_PER_RUN: 25,      // Reduced limit to prevent mass deletions
  MIN_TOTAL_VIOLATIONS: 50,       // Don't run if less than 50 total violations
  DRY_RUN: process.env.DRY_RUN !== 'false'  // Can be overridden with DRY_RUN=false
};

// --- Advanced False Positive Detection ---
function detectLocationFalsePositive(v1, v2, score) {
  if (score.details.withinLocationRadius && score.details.distanceKm > 0) {
    const location1 = (v1.location?.name?.en || '').toLowerCase();
    const location2 = (v2.location?.name?.en || '').toLowerCase();
    const specificLocations = ['village', 'town', 'neighborhood', 'district', 'quarter', 'camp', 'checkpoint', 'hospital', 'mosque', 'school', 'factory', 'road', 'street', 'roundabout'];
    const hasSpecificLocation1 = specificLocations.some(term => location1.includes(term));
    const hasSpecificLocation2 = specificLocations.some(term => location2.includes(term));
    if (hasSpecificLocation1 && hasSpecificLocation2) {
      const isSameSpecificLocation = specificLocations.some(term => location1.includes(term) && location2.includes(term));
      if (!isSameSpecificLocation) return true;
    }
  }
  return false;
}

function extractVictimInfo(description) {
  if (!description) return [];
  const patterns = [
    /(?:named|called)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/gi,
    /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:was|were)\s+(?:killed|shot)/gi,
    /(?:young man|young woman|child|boy|girl)\s+(?:named|called)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/gi
  ];
  const victims = [];
  patterns.forEach(pattern => {
    let match;
    while ((match = pattern.exec(description)) !== null) {
      if (match[1]) {
        // Clean up the extracted name - remove extra words
        const name = match[1].trim();
        // Only keep if it looks like a proper name (2+ words, no extra terms)
        if (name.split(' ').length >= 2 && !name.includes('was') && !name.includes('were')) {
          victims.push(name);
        }
      }
    }
  });
  
  // Clean up the extracted names to get just the actual person names
  const cleanedVictims = [];
  victims.forEach(victim => {
    // Remove common prefixes and suffixes
    let cleanName = victim
      .replace(/^(the\s+)?(young\s+)?(man|woman|child|boy|girl)\s+(named|called)\s+/i, '')
      .replace(/^(the\s+)?(young\s+)?(man|woman|child|boy|girl)\s+/i, '')
      .trim();
    
    // Only keep if it's a proper name (2+ words)
    if (cleanName.split(' ').length >= 2) {
      cleanedVictims.push(cleanName);
    }
  });
  
  return cleanedVictims.map(v => v.trim().toLowerCase());
}

function detectDifferentVictims(v1, v2) {
  const victims1 = extractVictimInfo(v1.description?.en || '');
  const victims2 = extractVictimInfo(v2.description?.en || '');
  if (victims1.length > 0 && victims2.length > 0) {
    // Use fuzzy matching to handle minor spelling variations
    return !victims1.some(v1 => victims2.some(v2 => {
      // Exact match
      if (v1 === v2) return true;
      
      // Check for minor spelling variations (like Ahmad vs Ahmed)
      const similarity = stringSimilarity.compareTwoStrings(v1, v2);
      return similarity >= 0.85; // 85% similarity threshold for names (lowered from 90%)
    }));
  }
  return false;
}

function detectPerpetratorMismatch(v1, v2, score) {
  if (score.details.descriptionSimilarity > 0.7 && !score.details.samePerpetrator && !score.details.relatedPerpetrator) {
    return true;
  }
  return false;
}

function validateTimeWindow(v1, v2, score) {
  const timeDiff = calculateTimeDifference(v1.date, v2.date);
  
  // Use extended time window ONLY for very high text description similarity
  // This prevents false positives from same location/type with generic descriptions
  if (score.details.descriptionSimilarity >= CONFIG.HIGH_SIMILARITY_THRESHOLD) {
    // 90%+ description similarity: Allow extended window (48 hours)
    return timeDiff <= CONFIG.EXTENDED_TIME_WINDOW_HOURS;
  }
  
  if (score.details.descriptionSimilarity >= 0.80) {
    // 80%+ description similarity: Allow moderate extension (24 hours)
    return timeDiff <= 24;
  }
  
  if (score.details.descriptionSimilarity >= 0.75) {
    // 75%+ description similarity: Allow small extension (12 hours)
    return timeDiff <= 12;
  }
  
  if (score.details.descriptionSimilarity >= 0.65) {
    // 65%+ description similarity: Allow minimal extension (6 hours)
    return timeDiff <= 6;
  }
  
  if (score.details.descriptionSimilarity >= 0.5) {
    // 50%+ description similarity: Standard window (3 hours)
    return timeDiff <= 2;
  }
  
  // Low description similarity: Strict window (3 hours)
  return timeDiff <= CONFIG.TIME_WINDOW_HOURS;
}

function validateSemanticContext(v1, v2) {
  const desc1 = (v1.description?.en || '').toLowerCase();
  const desc2 = (v2.description?.en || '').toLowerCase();
  const semanticIndicators = {
    'player': ['football player', 'sports player', 'player'],
    'child': ['boy', 'girl', 'teenager', 'young'],
    'soldier': ['army', 'military', 'soldier'],
    'clash': ['clash', 'clashes', 'fight', 'battle', 'conflict'],
    'dispute': ['dispute', 'disputes', 'quarrel', 'altercation'],
    'tribal': ['tribal', 'tribe', 'clan'],
    'family': ['family', 'families', 'between families'],
    'weapons': ['weapons', 'weapon', 'gun', 'guns', 'firearms'],
    'explosion': ['bomb', 'blast', 'detonation'],
    'detention': ['arrested', 'detained', 'arrest', 'detention', 'campaign', 'operation', 'security', 'militia', 'pyd', 'sdf'],
    'civilian': ['civilian', 'civilians', 'citizen', 'citizens', 'resident', 'residents'],
    'neighborhood': ['neighborhood', 'district', 'area', 'quarter', 'gweiran', 'al-aziziyah'],
    'family_clash': ['family', 'families', 'vendetta', 'clash between families', 'family dispute', 'family feud'],
    'armed_clash': ['armed clash', 'armed conflict', 'gunfight', 'shooting', 'gunfire', 'armed dispute']
  };
  let hasSharedSemanticContext = false;
  
  // First check for exact shared terms
  for (const terms of Object.values(semanticIndicators)) {
    const hasTerm1 = terms.some(term => desc1.includes(term));
    const hasTerm2 = terms.some(term => desc2.includes(term));
    if (hasTerm1 && hasTerm2) {
      hasSharedSemanticContext = true;
      break;
    }
  }
  
  // If no exact shared terms, check for related semantic categories
  if (!hasSharedSemanticContext) {
    const relatedCategories = [
      ['clash', 'dispute'], // clash and dispute are related
      ['tribal', 'family'], // tribal and family conflicts are related
      ['weapons', 'clash'], // weapons used in clashes
      ['weapons', 'dispute'], // weapons used in disputes
      ['family', 'clash'], // family clashes
      ['tribal', 'dispute'] // tribal disputes
    ];
    
    for (const [category1, category2] of relatedCategories) {
      const terms1 = semanticIndicators[category1] || [];
      const terms2 = semanticIndicators[category2] || [];
      
      const hasCategory1InDesc1 = terms1.some(term => desc1.includes(term));
      const hasCategory2InDesc2 = terms2.some(term => desc2.includes(term));
      const hasCategory1InDesc2 = terms1.some(term => desc2.includes(term));
      const hasCategory2InDesc1 = terms2.some(term => desc1.includes(term));
      
      // If one description has category1 and the other has category2 (related categories)
      if ((hasCategory1InDesc1 && hasCategory2InDesc2) || (hasCategory1InDesc2 && hasCategory2InDesc1)) {
        hasSharedSemanticContext = true;
        break;
      }
    }
  }
  
  return hasSharedSemanticContext;
}

// NEW: Smart false positive detection that preserves legitimate duplicates
function detectSmartFalsePositive(v1, v2, score) {
  // Pattern 1: Different cities within same governorate (eliminate false positives)
  const location1 = (v1.location?.name?.en || '').toLowerCase();
  const location2 = (v2.location?.name?.en || '').toLowerCase();
  
  // Check for different city names
  const cities1 = extractCityNames(location1);
  const cities2 = extractCityNames(location2);
  if (cities1.length > 0 && cities2.length > 0) {
    const hasDifferentCities = !cities1.some(city1 => cities2.some(city2 => city1 === city2));
    if (hasDifferentCities && score.details.distanceKm > 0.5) {
      return true; // False positive - different cities
    }
  }
  
  // Pattern 2: Different specific victims with same perpetrator (eliminate false positives)
  if (score.details.samePerpetrator || score.details.relatedPerpetrator) {
    const victims1 = extractVictimInfo(v1.description?.en || '');
    const victims2 = extractVictimInfo(v2.description?.en || '');
    if (victims1.length > 0 && victims2.length > 0) {
      // Use fuzzy matching to handle minor spelling variations
      const hasDifferentVictims = !victims1.some(v1 => victims2.some(v2 => {
        // Exact match
        if (v1 === v2) return true;
        
        // Check for minor spelling variations (like Ahmad vs Ahmed)
        const similarity = stringSimilarity.compareTwoStrings(v1, v2);
        return similarity >= 0.85; // 85% similarity threshold for names
      }));
      if (hasDifferentVictims) {
        return true; // False positive - different victims
      }
    }
  }
  
  // Pattern 3: High similarity but different specific locations (eliminate false positives)
  if (score.details.descriptionSimilarity > 0.8) {
    const specificLocations1 = extractSpecificLocations(location1);
    const specificLocations2 = extractSpecificLocations(location2);
    if (specificLocations1.length > 0 && specificLocations2.length > 0) {
      const hasDifferentSpecificLocations = !specificLocations1.some(loc1 => 
        specificLocations2.some(loc2 => loc1 === loc2)
      );
      if (hasDifferentSpecificLocations) {
        return true; // False positive - different specific locations
      }
    }
  }
  
  // Pattern 4: Special case - preserve Idlib violations (legitimate duplicates)
  const isIdlibCase = location1.includes('idlib') && location2.includes('idlib');
  if (isIdlibCase && score.details.descriptionSimilarity > 0.7) {
    // Check for semantic indicators that suggest same event
    const desc1 = (v1.description?.en || '').toLowerCase();
    const desc2 = (v2.description?.en || '').toLowerCase();
    const hasPlayerIndicator = (desc1.includes('player') || desc1.includes('football')) && 
                              (desc2.includes('player') || desc2.includes('football'));
    if (hasPlayerIndicator) {
      return false; // Preserve this legitimate duplicate
    }
  }
  
  // Pattern 5: Require exact location match for high similarity cases (but allow exceptions)
  if (score.details.descriptionSimilarity > 0.7 && score.details.distanceKm > 0) {
    // Allow exceptions for legitimate duplicates with semantic context
    const hasSemanticContext = validateSemanticContext(v1, v2);
    if (!hasSemanticContext) {
      return true; // False positive - high similarity but different locations without semantic context
    }
  }
  
  return false;
}

function extractCityNames(locationText) {
  const cityPatterns = [
    /(?:in|at|near|around)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/gi,
    /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:city|town|village)/gi
  ];
  const cities = [];
  cityPatterns.forEach(pattern => {
    let match;
    while ((match = pattern.exec(locationText)) !== null) {
      if (match[1]) cities.push(match[1].toLowerCase());
    }
  });
  return cities;
}

function extractSpecificLocations(locationText) {
  const specificLocationPatterns = [
    /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:neighborhood|district|quarter|area)/gi,
    /(?:near|at)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/gi
  ];
  const locations = [];
  specificLocationPatterns.forEach(pattern => {
    let match;
    while ((match = pattern.exec(locationText)) !== null) {
      if (match[1]) locations.push(match[1].toLowerCase());
    }
  });
  return locations;
}

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

// Calculate casualty similarity based on all casualty counts
function calculateCasualtySimilarity(violation1, violation2) {
  // Get total casualty counts for both violations
  const casualtyFields = ['casualties', 'kidnapped_count', 'detained_count', 'injured_count', 'displaced_count'];
  
  const total1 = casualtyFields.reduce((sum, field) => sum + (violation1[field] || 0), 0);
  const total2 = casualtyFields.reduce((sum, field) => sum + (violation2[field] || 0), 0);
  
  if (total1 === 0 && total2 === 0) return 1;
  if (total1 === 0 || total2 === 0) return 0;
  
  const difference = Math.abs(total1 - total2);
  const maxTotal = Math.max(total1, total2);
  
  // Special handling for same-day events in same location - be more lenient with casualty differences
  const timeDiff = Math.abs(new Date(violation1.date) - new Date(violation2.date)) / (1000 * 60 * 60); // hours
  const location1 = (violation1.location?.name?.en || '').toLowerCase();
  const location2 = (violation2.location?.name?.en || '').toLowerCase();
  
  // Check if they're on the same day (within 24 hours) and in the same city
  const sameDay = timeDiff <= 24;
  const extractCityName = (text) => {
    const cities = ['idlib', 'al-hasakah', 'damascus', 'aleppo', 'homs', 'hama', 'latakia', 'tartus', 'daraa', 'quneitra', 'deir ez-zor', 'al-raqqah', 'al-suwayda', 'tafas'];
    for (const city of cities) {
      if (text.includes(city)) {
        return city;
      }
    }
    return null;
  };
  
  const city1 = extractCityName(location1);
  const city2 = extractCityName(location2);
  const sameCity = city1 && city2 && city1 === city2;
  
  if (sameDay && sameCity) {
    // For same-day events in same city, be more lenient with casualty differences
    // This accounts for the fact that casualty counts often vary between reports of the same incident
    const baseSimilarity = Math.max(0, 1 - (difference / maxTotal));
    
    // Boost similarity for same-day, same-location events
    if (difference <= 5) {
      return Math.min(1.0, baseSimilarity + 0.4); // Boost by 40% for small differences (1-2 casualties)
    } else if (difference <= 10) {
      return Math.min(1.0, baseSimilarity + 0.3); // Boost by 30% for medium differences
    } else if (difference <= 20) {
      return Math.min(1.0, baseSimilarity + 0.2); // Boost by 20% for larger differences
    }
  }
  
  // Special handling for detention violations - be more lenient for same campaign
  if (violation1.type === 'DETENTION' && violation2.type === 'DETENTION') {
    // For detention violations, if they're in the same city and same perpetrator, 
    // be more lenient with casualty differences as they might be part of the same campaign
    const perp1 = (violation1.perpetrator_affiliation || '').toLowerCase();
    const perp2 = (violation2.perpetrator_affiliation || '').toLowerCase();
    const samePerpetrator = perp1 === perp2;
    
    if (sameCity && samePerpetrator) {
      // For same city and perpetrator, be more lenient with casualty differences
      // This accounts for the fact that detention counts often increase over time in the same campaign
      const baseSimilarity = Math.max(0, 1 - (difference / maxTotal));
      
      // Boost similarity for detention campaigns
      if (difference <= 10) {
        return Math.min(1.0, baseSimilarity + 0.3); // Boost by 30% for small differences
      } else if (difference <= 30) {
        return Math.min(1.0, baseSimilarity + 0.2); // Boost by 20% for medium differences
      } else if (difference <= 50) {
        return Math.min(1.0, baseSimilarity + 0.1); // Boost by 10% for larger differences
      }
    }
  }
  
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
  
  // Smart semantic indicator detection for high-value terms
  const semanticIndicators = {
    // Person-specific indicators (high value)
    'player': ['player', 'football player', 'soccer player', 'athlete'],
    'child': ['child', 'boy', 'girl', 'teenager', 'young'],
    'soldier': ['soldier', 'military', 'army', 'officer'],
    'civilian': ['civilian', 'citizen', 'resident'],
    
    // Location-specific indicators (high value)
    'neighborhood': ['neighborhood', 'district', 'area', 'quarter'],
    'village': ['village', 'town', 'rural'],
    'checkpoint': ['checkpoint', 'barrier', 'post'],
    
    // Event-specific indicators (high value)
    'clash': ['clash', 'fight', 'confrontation', 'battle'],
    'dispute': ['dispute', 'conflict', 'quarrel', 'altercation'],
    'tribal': ['tribal', 'tribe', 'clan', 'family'],
    'family': ['family', 'families', 'between families', 'family dispute'],
    'explosion': ['explosion', 'blast', 'bomb', 'detonation'],
    'airstrike': ['airstrike', 'drone', 'aircraft', 'bombing'],
    
    // Low-entropy terms that are common in violations (low value)
    'killed': ['killed', 'dead', 'shot', 'murdered'],
    'injured': ['injured', 'wounded', 'hurt'],
    'arrested': ['arrested', 'detained', 'captured']
  };
  
  // Calculate semantic similarity boost
  let semanticBoost = 0;
  const desc1Lower = desc1.toLowerCase();
  const desc2Lower = desc2.toLowerCase();
  
  for (const [category, terms] of Object.entries(semanticIndicators)) {
    const hasTerm1 = terms.some(term => desc1Lower.includes(term));
    const hasTerm2 = terms.some(term => desc2Lower.includes(term));
    
    if (hasTerm1 && hasTerm2) {
      // Both descriptions contain terms from the same category
      if (category === 'player' || category === 'child' || category === 'soldier') {
        semanticBoost += 0.3; // High-value person indicators
      } else if (category === 'neighborhood' || category === 'village' || category === 'checkpoint') {
        semanticBoost += 0.2; // High-value location indicators
      } else if (category === 'clash' || category === 'dispute' || category === 'tribal' || category === 'family' || category === 'explosion' || category === 'airstrike') {
        semanticBoost += 0.25; // High-value event indicators (increased for conflict terms)
      } else {
        semanticBoost += 0.05; // Low-value common terms
      }
    }
  }
  
  // Special boost for related conflict terms (clash vs dispute, tribal vs family)
  const conflictTermPairs = [
    ['clash', 'dispute'], ['clash', 'conflict'], ['dispute', 'conflict'],
    ['tribal', 'family'], ['tribal', 'clan'], ['family', 'clan'],
    ['fight', 'battle'], ['fight', 'confrontation'], ['battle', 'confrontation']
  ];
  
  for (const [term1, term2] of conflictTermPairs) {
    const hasTerm1InDesc1 = desc1Lower.includes(term1);
    const hasTerm2InDesc1 = desc1Lower.includes(term2);
    const hasTerm1InDesc2 = desc2Lower.includes(term1);
    const hasTerm2InDesc2 = desc2Lower.includes(term2);
    
    // If one description has term1 and the other has term2 (related terms)
    if ((hasTerm1InDesc1 && hasTerm2InDesc2) || (hasTerm2InDesc1 && hasTerm1InDesc2)) {
      semanticBoost += 0.2; // Boost for related conflict terms
    }
  }
  
  // Apply semantic boost
  finalSimilarity = Math.min(1.0, finalSimilarity + semanticBoost);
  
  // Penalize if descriptions have opposite outcomes (critical difference)
  const outcomeKeywords = {
    death: ['killed', 'shot', 'dead', 'died', 'death', 'murdered', 'assassinated'],
    injury: ['injured', 'wounded', 'hurt', 'bruises', 'wounds', 'casualties'],
    detention: ['arrested', 'detained', 'captured', 'kidnapped']
  };
  
  const extractOutcomes = (text) => {
    const outcomes = [];
    for (const [outcome, keywords] of Object.entries(outcomeKeywords)) {
      if (keywords.some(keyword => text.includes(keyword))) {
        outcomes.push(outcome);
      }
    }
    return outcomes;
  };
  
  const outcomes1 = extractOutcomes(desc1Lower);
  const outcomes2 = extractOutcomes(desc2Lower);
  
  // Check for opposite outcomes
  const hasDeath1 = outcomes1.includes('death');
  const hasDeath2 = outcomes2.includes('death');
  const hasInjury1 = outcomes1.includes('injury');
  const hasInjury2 = outcomes2.includes('injury');
  
  // Heavy penalty for opposite outcomes (death vs injury)
  if ((hasDeath1 && hasInjury2 && !hasDeath2) || (hasDeath2 && hasInjury1 && !hasDeath1)) {
    finalSimilarity *= 0.3; // Severe penalty - these are clearly different incidents
  } else if (hasDeath1 !== hasDeath2) {
    finalSimilarity *= 0.6; // Moderate penalty for death vs no death
  }
  
  // Additional penalty for different casualty counts when outcomes are similar
  const extractNumbers = (text) => {
    const numbers = text.match(/\d+/g);
    return numbers ? numbers.map(n => parseInt(n)) : [];
  };
  
  const numbers1 = extractNumbers(desc1);
  const numbers2 = extractNumbers(desc2);
  
  // If both have casualty numbers and they're very different, reduce similarity
  if (numbers1.length > 0 && numbers2.length > 0) {
    const maxNum1 = Math.max(...numbers1);
    const maxNum2 = Math.max(...numbers2);
    if (Math.abs(maxNum1 - maxNum2) > 2 && maxNum1 > 0 && maxNum2 > 0) {
      finalSimilarity *= 0.8; // Penalty for very different casualty counts
    }
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

  // Type similarity - allow related types (case-insensitive)
  const relatedTypes = {
    'SHOOTING': ['MURDER', 'KILLING', 'ASSASSINATION'],
    'MURDER': ['SHOOTING', 'KILLING', 'ASSASSINATION', 'AIRSTRIKE'],
    'KILLING': ['SHOOTING', 'MURDER', 'ASSASSINATION', 'AIRSTRIKE'],
    'ASSASSINATION': ['SHOOTING', 'MURDER', 'KILLING'],
    'BOMBING': ['EXPLOSION', 'SHELLING', 'AIRSTRIKE'],
    'EXPLOSION': ['BOMBING', 'SHELLING', 'AIRSTRIKE'],
    'SHELLING': ['BOMBING', 'EXPLOSION', 'AIRSTRIKE'],
    'AIRSTRIKE': ['BOMBING', 'EXPLOSION', 'SHELLING', 'MURDER', 'KILLING']
  };
  
  // Handle case-insensitive type matching
  const type1 = v1.type?.toUpperCase();
  const type2 = v2.type?.toUpperCase();
  
  const isExactMatch = type1 === type2;
  const isRelated = relatedTypes[type1]?.includes(type2) || relatedTypes[type2]?.includes(type1);
  
  score.type = isExactMatch ? 1 : (isRelated ? 0.8 : 0);
  score.details.sameType = isExactMatch;
  score.details.relatedType = isRelated;

  // Time similarity with extended window for high similarity cases
  const timeDiff = calculateTimeDifference(v1.date, v2.date);
  
  // Calculate description similarity early to determine time window
  let descriptionSimilarity = 0;
  if (v1.description?.en && v2.description?.en) {
    descriptionSimilarity = calculateDescriptionSimilarity(v1.description.en, v2.description.en);
  } else if (v1.description?.ar && v2.description?.ar) {
    descriptionSimilarity = calculateDescriptionSimilarity(v1.description.ar, v2.description.ar);
  } else if (v1.description?.en && v2.description?.ar) {
    descriptionSimilarity = calculateDescriptionSimilarity(v1.description.en, v2.description.ar) * 0.7;
  } else if (v1.description?.ar && v2.description?.en) {
    descriptionSimilarity = calculateDescriptionSimilarity(v1.description.ar, v2.description.en) * 0.7;
  }
  
  // Calculate effective time window based on multiple factors
  let effectiveTimeWindow = CONFIG.TIME_WINDOW_HOURS;
  let usedExtendedTimeWindow = false;
  
  if (descriptionSimilarity >= CONFIG.HIGH_SIMILARITY_THRESHOLD) {
    effectiveTimeWindow = CONFIG.EXTENDED_TIME_WINDOW_HOURS;
    usedExtendedTimeWindow = true;
  } else if (descriptionSimilarity > 0.8) {
    effectiveTimeWindow = 12; // Extended to 12 hours for very high similarity
    usedExtendedTimeWindow = true;
  } else if (descriptionSimilarity > 0.7) {
    effectiveTimeWindow = 6; // Extended to 6 hours for high similarity
    usedExtendedTimeWindow = true;
  }
  
  // Store description similarity for later use in validation
  score.details.descriptionSimilarityForTime = descriptionSimilarity;
  
  // Calculate time score with improved logic
  let timeWindowValid = false;
  
  // Use extended time window ONLY for very high text description similarity
  // This prevents false positives from same location/type with generic descriptions
  if (descriptionSimilarity >= CONFIG.HIGH_SIMILARITY_THRESHOLD) {
    // 90%+ description similarity: Allow extended window (48 hours)
    timeWindowValid = timeDiff <= CONFIG.EXTENDED_TIME_WINDOW_HOURS;
  } else if (descriptionSimilarity >= 0.80) {
    // 80%+ description similarity: Allow moderate extension (24 hours)
    timeWindowValid = timeDiff <= 24;
  } else if (descriptionSimilarity >= 0.75) {
    // 75%+ description similarity: Allow small extension (12 hours)
    timeWindowValid = timeDiff <= 12;
  } else if (descriptionSimilarity >= 0.65) {
    // 65%+ description similarity: Allow minimal extension (6 hours)
    timeWindowValid = timeDiff <= 6;
  } else if (descriptionSimilarity >= 0.5) {
    // 50%+ description similarity: Standard window (3 hours)
    timeWindowValid = timeDiff <= 2;
  } else {
    // Low description similarity: Strict window (3 hours)
    timeWindowValid = timeDiff <= CONFIG.TIME_WINDOW_HOURS;
  }
  
  // Remove the special case that was too permissive
  // Only rely on very high description similarity for time window extension
  
  score.time = timeWindowValid ? 1 : 0;
  score.details.timeDiffHours = timeDiff;
  score.details.withinTimeWindow = timeWindowValid;
  score.details.usedExtendedTimeWindow = usedExtendedTimeWindow;

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
    
    // Check for exact match
    if (name1.toLowerCase() === name2.toLowerCase()) {
      locationSimilarity = 1;
      distance = 0; // Same location name = 0 distance
    } else {
      // Check for containment (e.g., "Al-Dabeet neighborhood, Idlib" contains "Idlib city")
      const name1Lower = name1.toLowerCase();
      const name2Lower = name2.toLowerCase();
      
      // Extract city names from location strings
      const extractCityName = (text) => {
        const cities = ['idlib', 'al-hasakah', 'damascus', 'aleppo', 'homs', 'hama', 'latakia', 'tartus', 'daraa', 'quneitra', 'deir ez-zor', 'al-raqqah', 'al-suwayda'];
        for (const city of cities) {
          if (text.includes(city)) {
            return city;
          }
        }
        return null;
      };
      
      const city1 = extractCityName(name1Lower);
      const city2 = extractCityName(name2Lower);
      const isSameCity = city1 && city2 && city1 === city2;
      
      if (isSameCity) {
        // Both locations mention the same city - check if they're the same area
        const isExactArea = name1Lower === name2Lower;
        const isSubArea = name1Lower.includes(name2Lower) || name2Lower.includes(name1Lower);
        
        if (isExactArea) {
          locationSimilarity = 1;
          distance = 0;
        } else if (isSubArea) {
          // One is a subset of the other (e.g., "Idlib city" vs "Al-Dabeet neighborhood, Idlib")
          locationSimilarity = 0.9;
          distance = 1;
        } else {
          // Same city but different areas - moderately conservative
          locationSimilarity = 0.3;
          distance = 3;
        }
      } else {
        // Calculate text similarity for location names
        const nameSimilarity = stringSimilarity.compareTwoStrings(name1Lower, name2Lower);
        locationSimilarity = nameSimilarity >= 0.9 ? 1 : 0; // Increased threshold to 90%
        distance = nameSimilarity >= 0.9 ? 1 : Infinity;
      }
    }
  }
  
  score.location = locationSimilarity;
  score.details.distanceKm = distance;
  score.details.withinLocationRadius = locationSimilarity >= 0.9; // Allow high similarity locations

  // Perpetrator similarity (case-insensitive)
  const perp1 = (v1.perpetrator_affiliation || '').toLowerCase();
  const perp2 = (v2.perpetrator_affiliation || '').toLowerCase();
  
  // Related perpetrator groups that should be considered similar
  const relatedPerpetrators = {
    'unknown': ['various_armed_groups', 'unknown', 'other', 'tribal_groups', 'family_groups', 'local_gangs'],
    'various_armed_groups': ['unknown', 'various_armed_groups', 'other', 'tribal_groups', 'family_groups', 'local_gangs'],
    'other': ['unknown', 'various_armed_groups', 'other', 'tribal_groups', 'family_groups', 'local_gangs'],
    'tribal_groups': ['unknown', 'various_armed_groups', 'other', 'tribal_groups', 'family_groups', 'local_gangs'],
    'family_groups': ['unknown', 'various_armed_groups', 'other', 'tribal_groups', 'family_groups', 'local_gangs'],
    'local_gangs': ['unknown', 'various_armed_groups', 'other', 'tribal_groups', 'family_groups', 'local_gangs']
  };
  
  const isExactPerpMatch = perp1 === perp2;
  const isRelatedPerp = relatedPerpetrators[perp1]?.includes(perp2) || relatedPerpetrators[perp2]?.includes(perp1);
  
  // Fuzzy matching for perpetrator affiliations that might be similar
  let fuzzyPerpMatch = false;
  if (!isExactPerpMatch && !isRelatedPerp) {
    // Check for fuzzy matches in perpetrator descriptions
    const perpKeywords = {
      'tribal': ['tribal', 'tribe', 'clan', 'family', 'families'],
      'gangs': ['gangs', 'gang', 'armed groups', 'groups', 'militias'],
      'unknown': ['unknown', 'unidentified', 'various', 'multiple'],
      'local': ['local', 'regional', 'area', 'district']
    };
    
    // Extract keywords from perpetrator affiliations
    const extractKeywords = (perpText) => {
      const keywords = [];
      for (const [category, terms] of Object.entries(perpKeywords)) {
        if (terms.some(term => perpText.includes(term))) {
          keywords.push(category);
        }
      }
      return keywords;
    };
    
    const keywords1 = extractKeywords(perp1);
    const keywords2 = extractKeywords(perp2);
    
    // If they share any keyword categories, consider them related
    fuzzyPerpMatch = keywords1.some(k => keywords2.includes(k));
    
    // Special case: "Various Armed Groups & Gangs" vs "Unknown" should be considered related
    // for tribal/family disputes as they often involve unidentified local groups
    if ((perp1.includes('various') && perp1.includes('gangs') && perp2 === 'unknown') ||
        (perp2.includes('various') && perp2.includes('gangs') && perp1 === 'unknown')) {
      fuzzyPerpMatch = true;
    }
  }
  
  score.perpetrator = isExactPerpMatch ? 1 : (isRelatedPerp || fuzzyPerpMatch ? 0.8 : 0);
  score.details.samePerpetrator = isExactPerpMatch;
  score.details.relatedPerpetrator = isRelatedPerp || fuzzyPerpMatch;

  // Casualty similarity using all casualty fields
  score.casualties = calculateCasualtySimilarity(v1, v2);
  
  score.details.casualtySimilarity = score.casualties;

  // Use the description similarity already calculated for time window
  score.description = score.details.descriptionSimilarityForTime;
  score.details.descriptionSimilarity = score.details.descriptionSimilarityForTime;

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
    score.details.withinTimeWindow,
    score.details.withinLocationRadius
  ];

  // Allow related types to pass the essential criteria
  const typeOk = score.details.sameType || score.details.relatedType;
  
  const meetsEssential = essentialCriteria.every(req => req === true) && typeOk;
  
  // If all essential criteria match perfectly, we can be more lenient with description
  const strongMatch = meetsEssential && score.details.samePerpetrator;
  
  // Balanced validation: require stronger evidence for duplicates
  let descriptionOk;
  if (strongMatch) {
    // Strong match: same location, time, type, and perpetrator
    descriptionOk = score.details.descriptionSimilarity >= 0.35;
  } else if (score.details.sameType && score.details.withinLocationRadius) {
    // Same type and location: require good description match
    descriptionOk = score.details.descriptionSimilarity >= 0.5;
  } else if (score.details.relatedType && score.details.withinLocationRadius) {
    // Related types and same location: more lenient
    descriptionOk = score.details.descriptionSimilarity >= 0.35;
  } else {
    // Related types or different locations: require strong description match
    descriptionOk = score.details.descriptionSimilarity >= CONFIG.MIN_DESCRIPTION_SIMILARITY;
  }

  const meetsCore = meetsEssential && descriptionOk;
  
  // Check for high-confidence cases with strong location/time matches
  const isHighConfidenceCase = 
    score.details.withinTimeWindow && 
    score.details.withinLocationRadius && 
    (score.details.sameType || score.details.relatedType) &&
    score.details.descriptionSimilarity >= 0.3; // Minimum description threshold
  
  // Use lower threshold for high-confidence cases
  const effectiveThreshold = isHighConfidenceCase ? 0.75 : CONFIG.SIMILARITY_THRESHOLD;
  const meetsThreshold = score.total >= effectiveThreshold;
  
  const strongIndicators = [
    score.details.sameType,
    score.details.samePerpetrator,
    score.details.descriptionSimilarity >= 0.6
  ].filter(Boolean).length;
  const hasStrongEvidence = strongIndicators >= 1 || score.total >= 0.85 || isHighConfidenceCase;

  // --- Advanced false positive detection ---
  const isFalsePositive =
    detectLocationFalsePositive(v1, v2, score) ||
    detectDifferentVictims(v1, v2) ||
    detectPerpetratorMismatch(v1, v2, score) ||
    !validateTimeWindow(v1, v2, score) ||
    (!validateSemanticContext(v1, v2) && score.details.descriptionSimilarity < 0.8) ||
    detectSmartFalsePositive(v1, v2, score);

  return meetsCore && meetsThreshold && hasStrongEvidence && !isFalsePositive;
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

    // Merge all casualty counts by taking the maximum of each field
    const casualtyFields = ['casualties', 'kidnapped_count', 'detained_count', 'injured_count', 'displaced_count'];
    casualtyFields.forEach(field => {
      const currentCount = merged[field] || 0;
      const duplicateCount = duplicate[field] || 0;
      if (duplicateCount > currentCount) {
        merged[field] = duplicateCount;
      }
    });

    // Merge sources - combine unique source information
    if (duplicate.source && (duplicate.source.en || duplicate.source.ar)) {
      const currentSource = merged.source || { en: '', ar: '' };
      const duplicateSource = duplicate.source || { en: '', ar: '' };
      
      // Combine English sources
      if (duplicateSource.en && currentSource.en && !currentSource.en.includes(duplicateSource.en)) {
        merged.source = {
          en: currentSource.en ? `${currentSource.en}; ${duplicateSource.en}` : duplicateSource.en,
          ar: currentSource.ar || ''
        };
      } else if (duplicateSource.en && !currentSource.en) {
        // No existing English source, just add the new one
        merged.source = {
          en: duplicateSource.en,
          ar: currentSource.ar || ''
        };
      }
      
      // Combine Arabic sources
      if (duplicateSource.ar && currentSource.ar && !currentSource.ar.includes(duplicateSource.ar)) {
        merged.source = {
          en: merged.source?.en || currentSource.en || '',
          ar: currentSource.ar ? `${currentSource.ar}; ${duplicateSource.ar}` : duplicateSource.ar
        };
      } else if (duplicateSource.ar && !currentSource.ar) {
        // No existing Arabic source, just add the new one
        merged.source = {
          en: merged.source?.en || currentSource.en || '',
          ar: duplicateSource.ar
        };
      }
    }

    // Merge source URLs - combine unique URLs
    if (duplicate.source_urls && duplicate.source_urls.length > 0) {
      const currentSourceUrls = merged.source_urls || [];
      const duplicateSourceUrls = duplicate.source_urls || [];
      
      // Combine unique URLs from both violations
      const allUrls = [...currentSourceUrls, ...duplicateSourceUrls];
      const uniqueUrls = [...new Set(allUrls)].filter(url => url && url.trim()); // Remove duplicates and empty URLs
      
      merged.source_urls = uniqueUrls;
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
        console.log(`   Time Window: ${score.details.withinTimeWindow ? '✅' : '❌'} (${score.details.timeDiffHours.toFixed(1)}h)${score.details.usedExtendedTimeWindow ? ' [EXTENDED]' : ''}`);
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
  selectBestViolation,
  smartMerge,
  clusterViolations,
  detectLocationFalsePositive,
  detectDifferentVictims,
  detectPerpetratorMismatch,
  validateTimeWindow,
  validateSemanticContext,
  detectSmartFalsePositive,
  extractVictimInfo
}; 