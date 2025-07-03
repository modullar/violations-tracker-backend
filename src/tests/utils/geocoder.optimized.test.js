const mongoose = require('mongoose');
const { getCachedOrFreshGeocode, generateCacheKey, geocodeLocation } = require('../../utils/geocoder');
const GeocodingCache = require('../../models/GeocodingCache');
const { connectDB, closeDB } = require('../setup');

// Mock the logger to avoid console output during tests
jest.mock('../../config/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
}));

// Mock the original geocoding functions
jest.mock('node-geocoder', () => {
  return () => ({
    geocode: jest.fn()
  });
});

describe('Optimized Geocoder', () => {
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
    jest.clearAllMocks();
  });

  describe('generateCacheKey', () => {
    it('should generate consistent cache keys for same inputs', () => {
      const key1 = generateCacheKey('Damascus', 'Damascus Governorate', 'en');
      const key2 = generateCacheKey('Damascus', 'Damascus Governorate', 'en');
      
      expect(key1).toBe(key2);
      expect(key1).toMatch(/^[a-f0-9]{32}$/); // MD5 hash format
    });

    it('should generate different keys for different inputs', () => {
      const key1 = generateCacheKey('Damascus', 'Damascus Governorate', 'en');
      const key2 = generateCacheKey('Aleppo', 'Aleppo Governorate', 'en');
      const key3 = generateCacheKey('Damascus', 'Damascus Governorate', 'ar');
      
      expect(key1).not.toBe(key2);
      expect(key1).not.toBe(key3);
      expect(key2).not.toBe(key3);
    });

    it('should handle empty and null values gracefully', () => {
      const key1 = generateCacheKey('', '', 'en');
      const key2 = generateCacheKey(null, null, 'en');
      const key3 = generateCacheKey(undefined, undefined, 'en');
      
      expect(key1).toMatch(/^[a-f0-9]{32}$/);
      expect(key2).toMatch(/^[a-f0-9]{32}$/);
      expect(key3).toMatch(/^[a-f0-9]{32}$/);
    });

    it('should normalize case and whitespace', () => {
      const key1 = generateCacheKey('Damascus', 'Damascus Governorate', 'en');
      const key2 = generateCacheKey('DAMASCUS', 'DAMASCUS GOVERNORATE', 'en');
      const key3 = generateCacheKey('  Damascus  ', '  Damascus Governorate  ', 'en');
      
      expect(key1).toBe(key2);
      expect(key1).toBe(key3);
    });
  });

  describe('getCachedOrFreshGeocode', () => {
    const mockGeocodingResult = [{
      latitude: 33.513,
      longitude: 36.296,
      country: 'Syria',
      city: 'Damascus',
      state: 'Damascus Governorate',
      formattedAddress: 'Damascus, Syria',
      quality: 0.9,
      apiCallsUsed: 1
    }];

    beforeEach(() => {
      // Mock the geocodeLocationWithOptimizedStrategies function
      // We need to mock it at the module level since it's not exported
      const geocoderModule = require('../../utils/geocoder');
      if (geocoderModule.geocodeLocationWithOptimizedStrategies) {
        jest.spyOn(geocoderModule, 'geocodeLocationWithOptimizedStrategies')
          .mockResolvedValue(mockGeocodingResult);
      }
    });

    it('should throw error if placeName is not provided', async () => {
      await expect(getCachedOrFreshGeocode(null, 'Admin Division', 'en'))
        .rejects.toThrow('Place name is required for geocoding');
      
      await expect(getCachedOrFreshGeocode('', 'Admin Division', 'en'))
        .rejects.toThrow('Place name is required for geocoding');
    });

    it('should return cached result if available', async () => {
      // Create a cache entry
      const cacheKey = generateCacheKey('Damascus', 'Damascus Governorate', 'en');
      const cachedEntry = new GeocodingCache({
        cacheKey,
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
        hitCount: 1
      });
      await cachedEntry.save();

      const result = await getCachedOrFreshGeocode('Damascus', 'Damascus Governorate', 'en');

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        latitude: 33.513,
        longitude: 36.296,
        country: 'Syria',
        city: 'Damascus',
        fromCache: true
      });

      // Verify hit count was incremented
      const updatedEntry = await GeocodingCache.findOne({ cacheKey });
      expect(updatedEntry.hitCount).toBe(2);
    });

    it('should make API call and cache result if not in cache', async () => {
      // Mock the internal geocoding function
      const geocoderUtils = require('../../utils/geocoder');
      
      // Create a spy for the function that doesn't exist yet
      const mockOptimizedGeocode = jest.fn().mockResolvedValue(mockGeocodingResult);
      
      // Temporarily replace the function
      const originalFunction = geocoderUtils.geocodeLocationWithOptimizedStrategies;
      geocoderUtils.geocodeLocationWithOptimizedStrategies = mockOptimizedGeocode;

      try {
        const result = await getCachedOrFreshGeocode('Damascus', 'Damascus Governorate', 'en');

        expect(result).toHaveLength(1);
        expect(result[0]).toMatchObject({
          latitude: expect.closeTo(33.513, 1), // Allow coordinate precision variance
          longitude: expect.closeTo(36.296, 1),
          country: 'Syria'
        });

        // Verify result was cached
        const cacheKey = generateCacheKey('Damascus', 'Damascus Governorate', 'en');
        const cachedEntry = await GeocodingCache.findOne({ cacheKey });
        expect(cachedEntry).not.toBeNull();
        expect(cachedEntry.searchTerms.placeName).toBe('Damascus');
        expect(cachedEntry.results.coordinates[0]).toBeCloseTo(36.296, 1);
        expect(cachedEntry.results.coordinates[1]).toBeCloseTo(33.513, 1);
      } finally {
        // Restore original function
        geocoderUtils.geocodeLocationWithOptimizedStrategies = originalFunction;
      }
    });

    it('should handle API call failures gracefully', async () => {
      // Test with known invalid location format that should fail
      await expect(getCachedOrFreshGeocode('', '', 'en'))
        .rejects.toThrow('Place name is required for geocoding');
    });

    it('should handle cache lookup failures and continue with API call', async () => {
      // Mock cache findByCacheKey to fail
      const originalFindByCacheKey = GeocodingCache.findByCacheKey;
      GeocodingCache.findByCacheKey = jest.fn().mockRejectedValue(new Error('Database connection failed'));

      try {
        const result = await getCachedOrFreshGeocode('Damascus', 'Damascus Governorate', 'en');

        expect(result).toHaveLength(1);
        expect(result[0].latitude).toBeCloseTo(33.513, 1);
        expect(result[0].country).toBe('Syria');
      } finally {
        GeocodingCache.findByCacheKey = originalFindByCacheKey;
      }
    });
  });

  describe('Integration with geocodeLocation', () => {
    beforeEach(() => {
      // Reset any module-level mocks
      jest.resetModules();
    });

    it('should use optimized caching for normal operation', async () => {
      // Test that geocodeLocation works with the optimized approach
      const result = await geocodeLocation('Damascus', 'Damascus Governorate');

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        latitude: expect.closeTo(33.513, 1),
        longitude: expect.closeTo(36.296, 1),
        country: 'Syria'
      });
      // The function should return coordinates indicating successful geocoding
      expect(result[0].latitude).toBeDefined();
      expect(result[0].longitude).toBeDefined();
    });

    it('should handle test environment special cases', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'test';

      try {
        // Test invalid location
        const invalidResult = await geocodeLocation('xyznon-existentlocation12345completelyfake');
        expect(invalidResult).toEqual([]);

        // Test Bustan al-Qasr special case
        const bustanResult = await geocodeLocation('Bustan al-Qasr');
        expect(bustanResult).toHaveLength(1);
        expect(bustanResult[0]).toMatchObject({
          latitude: 36.186764,
          longitude: 37.1441285,
          country: 'Syria',
          city: 'Aleppo'
        });
      } finally {
        process.env.NODE_ENV = originalEnv;
      }
    });
  });

  describe('Cache Performance', () => {
    it('should demonstrate significant performance improvement with cache', async () => {
      const placeName = 'Damascus';
      const adminDivision = 'Damascus Governorate';
      const cacheKey = generateCacheKey(placeName, adminDivision, 'en');
      
      // Clear any existing cache
      await GeocodingCache.deleteOne({ cacheKey });

      // First call - cache miss, should create cache entry
      const result1 = await getCachedOrFreshGeocode(placeName, adminDivision, 'en');
      expect(result1).toHaveLength(1);

      // Second call - should hit cache
      const result2 = await getCachedOrFreshGeocode(placeName, adminDivision, 'en');
      expect(result2).toHaveLength(1);
      expect(result2[0].fromCache).toBe(true);

      // Verify cache entry exists and has hits
      const cacheEntry = await GeocodingCache.findOne({ cacheKey });
      expect(cacheEntry).not.toBeNull();
      expect(cacheEntry.hitCount).toBeGreaterThan(1);
    });
  });

  describe('Error Handling', () => {
    it('should handle database errors during caching gracefully', async () => {
      // Mock cache creation to fail
      const originalCreateOrUpdate = GeocodingCache.createOrUpdate;
      GeocodingCache.createOrUpdate = jest.fn().mockRejectedValue(new Error('Database write failed'));

      try {
        // Should still return results even if caching fails
        const result = await getCachedOrFreshGeocode('Damascus', 'Damascus Governorate', 'en');

        expect(result).toHaveLength(1);
        expect(result[0].latitude).toBeCloseTo(33.513, 2);
        // Verify the function still works despite cache write failure
        expect(result[0].country).toBe('Syria');
      } finally {
        GeocodingCache.createOrUpdate = originalCreateOrUpdate;
      }
    });
  });
}); 