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
  TIME_WINDOW_HOURS: 3,           // Keep 3 hours for tight time window
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
    /(?:young man|young woman|child|boy|girl)\s+(?:named|called)\s+([A-Z][a-z]+)/gi
  ];
  const victims = [];
  patterns.forEach(pattern => {
    let match;
    while ((match = pattern.exec(description)) !== null) {
      if (match[1]) victims.push(match[1]);
    }
  });
  return victims.map(v => v.trim().toLowerCase());
}

function detectDifferentVictims(v1, v2) {
  const victims1 = extractVictimInfo(v1.description?.en || '');
  const victims2 = extractVictimInfo(v2.description?.en || '');
  if (victims1.length > 0 && victims2.length > 0) {
    return !victims1.some(v1 => victims2.some(v2 => v1 === v2));
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
  if (score.details.descriptionSimilarity > 0.8) {
    return timeDiff <= 1;
  }
  if (score.details.descriptionSimilarity > 0.5) {
    return timeDiff <= 2;
  }
  return timeDiff <= 3;
}

function validateSemanticContext(v1, v2) {
  const desc1 = (v1.description?.en || '').toLowerCase();
  const desc2 = (v2.description?.en || '').toLowerCase();
  const semanticIndicators = {
    'player': ['football player', 'sports player', 'player'],
    'child': ['boy', 'girl', 'teenager', 'young'],
    'soldier': ['army', 'military', 'soldier'],
    'clash': ['fight', 'battle', 'conflict'],
    'explosion': ['bomb', 'blast', 'detonation']
  };
  let hasSharedSemanticContext = false;
  for (const terms of Object.values(semanticIndicators)) {
    const hasTerm1 = terms.some(term => desc1.includes(term));
    const hasTerm2 = terms.some(term => desc2.includes(term));
    if (hasTerm1 && hasTerm2) {
      hasSharedSemanticContext = true;
      break;
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
      const hasDifferentVictims = !victims1.some(v1 => victims2.some(v2 => v1 === v2));
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
      } else if (category === 'clash' || category === 'explosion' || category === 'airstrike') {
        semanticBoost += 0.2; // High-value event indicators
      } else {
        semanticBoost += 0.05; // Low-value common terms
      }
    }
  }
  
  // Apply semantic boost
  finalSimilarity = Math.min(1.0, finalSimilarity + semanticBoost);
  
  // Penalize if descriptions are too different in key aspects
  const hasKeyWords1 = desc1Lower.includes('killed') || desc1Lower.includes('shot') || desc1Lower.includes('dead');
  const hasKeyWords2 = desc2Lower.includes('killed') || desc2Lower.includes('shot') || desc2Lower.includes('dead');
  
  if (hasKeyWords1 !== hasKeyWords2) {
    finalSimilarity *= 0.8; // Reduce similarity if one mentions death/killing and the other doesn't
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
    'MURDER': ['SHOOTING', 'KILLING', 'ASSASSINATION'],
    'KILLING': ['SHOOTING', 'MURDER', 'ASSASSINATION'],
    'ASSASSINATION': ['SHOOTING', 'MURDER', 'KILLING'],
    'BOMBING': ['EXPLOSION', 'SHELLING', 'AIRSTRIKE'],
    'EXPLOSION': ['BOMBING', 'SHELLING', 'AIRSTRIKE'],
    'SHELLING': ['BOMBING', 'EXPLOSION', 'AIRSTRIKE'],
    'AIRSTRIKE': ['BOMBING', 'EXPLOSION', 'SHELLING']
  };
  
  // Handle case-insensitive type matching
  const type1 = v1.type?.toUpperCase();
  const type2 = v2.type?.toUpperCase();
  
  const isExactMatch = type1 === type2;
  const isRelated = relatedTypes[type1]?.includes(type2) || relatedTypes[type2]?.includes(type1);
  
  score.type = isExactMatch ? 1 : (isRelated ? 0.8 : 0);
  score.details.sameType = isExactMatch;
  score.details.relatedType = isRelated;

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
    
    // Check for exact match
    if (name1.toLowerCase() === name2.toLowerCase()) {
      locationSimilarity = 1;
      distance = 0; // Same location name = 0 distance
    } else {
      // Check for containment (e.g., "Al-Dabeet neighborhood, Idlib" contains "Idlib city")
      const name1Lower = name1.toLowerCase();
      const name2Lower = name2.toLowerCase();
      
      const containsIdlib = (text) => text.includes('idlib');
      const isSameCity = containsIdlib(name1Lower) && containsIdlib(name2Lower);
      
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
    'unknown': ['various_armed_groups', 'unknown', 'other'],
    'various_armed_groups': ['unknown', 'various_armed_groups', 'other'],
    'other': ['unknown', 'various_armed_groups', 'other']
  };
  
  const isExactPerpMatch = perp1 === perp2;
  const isRelatedPerp = relatedPerpetrators[perp1]?.includes(perp2) || relatedPerpetrators[perp2]?.includes(perp1);
  
  score.perpetrator = isExactPerpMatch ? 1 : (isRelatedPerp ? 0.8 : 0);
  score.details.samePerpetrator = isExactPerpMatch;
  score.details.relatedPerpetrator = isRelatedPerp;

  // Casualty similarity using all casualty fields
  score.casualties = calculateCasualtySimilarity(v1, v2);
  
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
  const meetsThreshold = score.total >= CONFIG.SIMILARITY_THRESHOLD;
  const strongIndicators = [
    score.details.sameType,
    score.details.samePerpetrator,
    score.details.descriptionSimilarity >= 0.6
  ].filter(Boolean).length;
  const hasStrongEvidence = strongIndicators >= 1 || score.total >= 0.85;

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
    if (duplicate.source_url && (duplicate.source_url.en || duplicate.source_url.ar)) {
      const currentSourceUrl = merged.source_url || { en: '', ar: '' };
      const duplicateSourceUrl = duplicate.source_url || { en: '', ar: '' };
      
      // Combine English source URLs
      if (duplicateSourceUrl.en && currentSourceUrl.en && !currentSourceUrl.en.includes(duplicateSourceUrl.en)) {
        merged.source_url = {
          en: currentSourceUrl.en ? `${currentSourceUrl.en}; ${duplicateSourceUrl.en}` : duplicateSourceUrl.en,
          ar: currentSourceUrl.ar || ''
        };
      } else if (duplicateSourceUrl.en && !currentSourceUrl.en) {
        // No existing English source URL, just add the new one
        merged.source_url = {
          en: duplicateSourceUrl.en,
          ar: currentSourceUrl.ar || ''
        };
      }
      
      // Combine Arabic source URLs
      if (duplicateSourceUrl.ar && currentSourceUrl.ar && !currentSourceUrl.ar.includes(duplicateSourceUrl.ar)) {
        merged.source_url = {
          en: merged.source_url?.en || currentSourceUrl.en || '',
          ar: currentSourceUrl.ar ? `${currentSourceUrl.ar}; ${duplicateSourceUrl.ar}` : duplicateSourceUrl.ar
        };
      } else if (duplicateSourceUrl.ar && !currentSourceUrl.ar) {
        // No existing Arabic source URL, just add the new one
        merged.source_url = {
          en: merged.source_url?.en || currentSourceUrl.en || '',
          ar: duplicateSourceUrl.ar
        };
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
  selectBestViolation,
  smartMerge
}; 