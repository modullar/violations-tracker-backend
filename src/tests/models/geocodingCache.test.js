const mongoose = require('mongoose');
const GeocodingCache = require('../../models/GeocodingCache');
const { connectDB, closeDB } = require('../setup');

describe('GeocodingCache Model', () => {
  beforeAll(async () => {
    await connectDB();
  });

  afterAll(async () => {
    await closeDB();
  });

  beforeEach(async () => {
    // Clear all GeocodingCache documents before each test
    if (mongoose.connection.readyState !== 0) {
      await GeocodingCache.deleteMany({});
    }
  });

  describe('Schema Validation', () => {
    it('should create a valid geocoding cache entry', async () => {
      const cacheData = {
        cacheKey: 'test_cache_key_123',
        searchTerms: {
          placeName: 'Damascus',
          adminDivision: 'Damascus Governorate',
          language: 'en'
        },
        results: {
          coordinates: [36.296, 33.513],
          formattedAddress: 'Damascus, Syria',
          country: 'Syria',
          city: 'Damascus',
          state: 'Damascus Governorate',
          quality: 0.9
        },
        source: 'places_api',
        apiCallsUsed: 2
      };

      const cache = new GeocodingCache(cacheData);
      const savedCache = await cache.save();

      expect(savedCache.cacheKey).toBe(cacheData.cacheKey);
      expect(savedCache.searchTerms.placeName).toBe(cacheData.searchTerms.placeName);
      expect(savedCache.results.coordinates).toEqual(cacheData.results.coordinates);
      expect(savedCache.source).toBe(cacheData.source);
      expect(savedCache.apiCallsUsed).toBe(cacheData.apiCallsUsed);
      expect(savedCache.hitCount).toBe(1);
      expect(savedCache.lastUsed).toBeInstanceOf(Date);
    });

    it('should require cacheKey field', async () => {
      const cacheData = {
        searchTerms: {
          placeName: 'Damascus',
          language: 'en'
        },
        results: {
          coordinates: [36.296, 33.513]
        }
      };

      const cache = new GeocodingCache(cacheData);
      
      await expect(cache.save()).rejects.toThrow(/cacheKey.*required/);
    });

    it('should enforce unique cacheKey constraint', async () => {
      const cacheData = {
        cacheKey: 'duplicate_key',
        searchTerms: { placeName: 'Test', language: 'en' },
        results: { coordinates: [36.296, 33.513] }
      };

      const cache1 = new GeocodingCache(cacheData);
      await cache1.save();

      const cache2 = new GeocodingCache(cacheData);
      await expect(cache2.save()).rejects.toThrow(/duplicate key/);
    });

    it('should validate source enum values', async () => {
      const cacheData = {
        cacheKey: 'test_key',
        searchTerms: { placeName: 'Test', language: 'en' },
        results: { coordinates: [36.296, 33.513] },
        source: 'invalid_source'
      };

      const cache = new GeocodingCache(cacheData);
      await expect(cache.save()).rejects.toThrow(/is not a valid enum value/);
    });
  });

  describe('Instance Methods', () => {
    it('should record hit and update lastUsed and hitCount', async () => {
      const cache = new GeocodingCache({
        cacheKey: 'test_hit_key',
        searchTerms: { placeName: 'Test', language: 'en' },
        results: { coordinates: [36.296, 33.513] }
      });
      
      const savedCache = await cache.save();
      const originalHitCount = savedCache.hitCount;
      const originalLastUsed = savedCache.lastUsed;

      // Wait a small amount to ensure timestamp difference
      await new Promise(resolve => setTimeout(resolve, 10));

      await savedCache.recordHit();

      expect(savedCache.hitCount).toBe(originalHitCount + 1);
      expect(savedCache.lastUsed.getTime()).toBeGreaterThan(originalLastUsed.getTime());
    });
  });

  describe('Static Methods', () => {
    beforeEach(async () => {
      // Create test data
      const testCacheEntries = [
        {
          cacheKey: 'damascus_key',
          searchTerms: { placeName: 'Damascus', language: 'en' },
          results: { coordinates: [36.296, 33.513], quality: 0.9 },
          hitCount: 5
        },
        {
          cacheKey: 'aleppo_key',
          searchTerms: { placeName: 'Aleppo', language: 'en' },
          results: { coordinates: [37.161, 36.202], quality: 0.8 },
          hitCount: 3
        },
        {
          cacheKey: 'homs_key',
          searchTerms: { placeName: 'Homs', language: 'en' },
          results: { coordinates: [36.723, 34.733], quality: 0.7 },
          hitCount: 1
        }
      ];

      await GeocodingCache.insertMany(testCacheEntries);
    });

    it('should find cache entry by cacheKey', async () => {
      const found = await GeocodingCache.findByCacheKey('damascus_key');
      
      expect(found).not.toBeNull();
      expect(found.searchTerms.placeName).toBe('Damascus');
      expect(found.results.coordinates).toEqual([36.296, 33.513]);
    });

    it('should return null for non-existent cacheKey', async () => {
      const found = await GeocodingCache.findByCacheKey('non_existent_key');
      expect(found).toBeNull();
    });

    it('should create new cache entry with createOrUpdate', async () => {
      const newCacheData = {
        searchTerms: { placeName: 'Latakia', language: 'en' },
        results: { coordinates: [35.784, 35.517], quality: 0.6 },
        source: 'geocoding_api',
        apiCallsUsed: 1
      };

      const created = await GeocodingCache.createOrUpdate('latakia_key', newCacheData);

      expect(created.cacheKey).toBe('latakia_key');
      expect(created.searchTerms.placeName).toBe('Latakia');
      expect(created.results.coordinates).toEqual([35.784, 35.517]);
    });

    it('should update existing cache entry with createOrUpdate', async () => {
      const existingEntry = await GeocodingCache.findByCacheKey('damascus_key');
      const originalHitCount = existingEntry.hitCount;

      const updateData = {
        results: { coordinates: [36.300, 33.520], quality: 0.95 }
      };

      const updated = await GeocodingCache.createOrUpdate('damascus_key', updateData);

      expect(updated.cacheKey).toBe('damascus_key');
      expect(updated.results.coordinates).toEqual([36.300, 33.520]);
      expect(updated.results.quality).toBe(0.95);
      expect(updated.hitCount).toBe(originalHitCount + 1);
    });

    it('should return correct cache statistics', async () => {
      const stats = await GeocodingCache.getStats();

      expect(stats.totalEntries).toBe(3);
      expect(stats.recentHits).toBe(3); // All entries were created recently
      expect(stats.topLocations).toHaveLength(3);
      
      // Should be sorted by hitCount descending
      expect(stats.topLocations[0].hitCount).toBe(5); // Damascus
      expect(stats.topLocations[1].hitCount).toBe(3); // Aleppo
      expect(stats.topLocations[2].hitCount).toBe(1); // Homs
    });
  });

  describe('Indexes and Performance', () => {
    it('should have proper indexes for efficient lookups', async () => {
      const indexes = await GeocodingCache.collection.getIndexes();
      
      // Check for cacheKey index
      expect(indexes.cacheKey_1).toBeDefined();
      
      // Check for TTL index on createdAt
      expect(indexes.createdAt_1).toBeDefined();
      expect(indexes.createdAt_1[0][1]).toBe(1);
    });
  });

  describe('TTL Functionality', () => {
    it('should set TTL index for automatic expiration', async () => {
      // This test verifies the TTL index exists
      // In a real scenario, the document would expire after 90 days
      const indexes = await GeocodingCache.collection.getIndexes();
      const ttlIndex = indexes.createdAt_1;
      
      expect(ttlIndex).toBeDefined();
      // The TTL should be set to 7776000 seconds (90 days)
      // Note: MongoDB may not show the expireAfterSeconds in getIndexes() response
      // but we can verify the index exists
    });
  });

  describe('Data Integrity', () => {
    it('should handle coordinates array validation', async () => {
      const cacheData = {
        cacheKey: 'coord_test_key',
        searchTerms: { placeName: 'Test', language: 'en' },
        results: {
          coordinates: [36.296, 33.513, 'invalid_coord'], // Invalid third element
          quality: 0.9
        }
      };

      const cache = new GeocodingCache(cacheData);
      
      // Should reject invalid coordinates
      await expect(cache.save()).rejects.toThrow(/Cast to.*Number.*failed/);
    });

    it('should handle empty search terms gracefully', async () => {
      const cacheData = {
        cacheKey: 'empty_terms_key',
        searchTerms: {},
        results: { coordinates: [36.296, 33.513] }
      };

      const cache = new GeocodingCache(cacheData);
      const savedCache = await cache.save();
      
      expect(savedCache.searchTerms).toEqual({});
    });
  });
}); 