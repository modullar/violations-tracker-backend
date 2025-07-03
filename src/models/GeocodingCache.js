const mongoose = require('mongoose');

const GeocodingCacheSchema = new mongoose.Schema({
  // Cache key based on normalized location names
  cacheKey: {
    type: String,
    unique: true,
    required: true,
    index: true
  },
  // Original search terms
  searchTerms: {
    placeName: String,
    adminDivision: String,
    language: String
  },
  // Geocoding results
  results: {
    coordinates: [Number], // [longitude, latitude]
    formattedAddress: String,
    country: String,
    city: String,
    state: String,
    quality: Number
  },
  // Cache metadata
  source: {
    type: String,
    enum: ['places_api', 'geocoding_api', 'manual'],
    default: 'places_api'
  },
  apiCallsUsed: {
    type: Number,
    default: 1
  },
  lastUsed: {
    type: Date,
    default: Date.now
  },
  hitCount: {
    type: Number,
    default: 1
  }
}, {
  timestamps: true
});

// TTL index - cache expires after 90 days
GeocodingCacheSchema.index({ createdAt: 1 }, { expireAfterSeconds: 7776000 });

// Index for efficient lookups
GeocodingCacheSchema.index({ lastUsed: -1 });
GeocodingCacheSchema.index({ hitCount: -1 });

// Update last used and hit count when cache is accessed
GeocodingCacheSchema.methods.recordHit = function() {
  this.lastUsed = new Date();
  this.hitCount += 1;
  return this.save();
};

// Static method to find cached result
GeocodingCacheSchema.statics.findByCacheKey = function(cacheKey) {
  return this.findOne({ cacheKey });
};

// Static method to create or update cache entry
GeocodingCacheSchema.statics.createOrUpdate = async function(cacheKey, data) {
  const existing = await this.findOne({ cacheKey });
  if (existing) {
    // Update existing entry with new data if provided
    Object.assign(existing, data);
    existing.lastUsed = new Date();
    existing.hitCount += 1;
    return existing.save();
  } else {
    // Create new entry
    return this.create({ cacheKey, ...data });
  }
};

// Static method to get cache statistics
GeocodingCacheSchema.statics.getStats = async function() {
  const [totalEntries, recentHits, topLocations] = await Promise.all([
    this.countDocuments(),
    this.countDocuments({ lastUsed: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } }),
    this.find().sort({ hitCount: -1 }).limit(10).select('searchTerms hitCount lastUsed')
  ]);
  
  return {
    totalEntries,
    recentHits,
    topLocations
  };
};

module.exports = mongoose.model('GeocodingCache', GeocodingCacheSchema); 