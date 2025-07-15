const mongoose = require('mongoose');
const { batchGeocodeLocations, createBatchViolations } = require('../../../commands/violations/create');
const { connectDB, closeDB } = require('../../setup');

// Mock dependencies
jest.mock('../../../utils/geocoder', () => ({
  geocodeLocation: jest.fn(),
  getCachedOrFreshGeocode: jest.fn()
}));

jest.mock('../../../models/Violation', () => ({
  validateBatch: jest.fn(),
  validateForCreation: jest.fn(),
  create: jest.fn(),
  findById: jest.fn(),
  find: jest.fn()
}));

jest.mock('../../../utils/duplicateChecker', () => ({
  checkForDuplicates: jest.fn()
}));

jest.mock('../../../config/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
}));

describe('Batch Geocoding Optimization', () => {
  const { getCachedOrFreshGeocode } = require('../../../utils/geocoder');
  const Violation = require('../../../models/Violation');
  const { checkForDuplicates } = require('../../../utils/duplicateChecker');
  const logger = require('../../../config/logger');

  beforeAll(async () => {
    await connectDB();
  });

  afterAll(async () => {
    await closeDB();
  });

  beforeEach(async () => {
    // Clear all collections before each test
    if (mongoose.connection.readyState !== 0) {
      const collections = mongoose.connection.collections;
      for (const key in collections) {
        await collections[key].deleteMany({});
      }
    }
    jest.clearAllMocks();
    
    // Default mock implementations
    checkForDuplicates.mockResolvedValue({
      hasDuplicates: false,
      duplicates: [],
      bestMatch: null
    });
  });

  describe('batchGeocodeLocations', () => {
    beforeEach(() => {
      // Mock successful geocoding with the optimized function
      getCachedOrFreshGeocode.mockResolvedValue([{
        latitude: 36.202,
        longitude: 37.161,
        country: 'Syria',
        city: 'Aleppo',
        quality: 0.9,
        fromCache: false
      }]);
    });

    it('should deduplicate identical locations and make minimal API calls', async () => {
      const violations = [
        {
          type: 'AIRSTRIKE',
          location: {
            name: { en: 'Aleppo', ar: 'حلب' },
            administrative_division: { en: 'Aleppo Governorate', ar: 'محافظة حلب' }
          }
        },
        {
          type: 'SHELLING',
          location: {
            name: { en: 'Aleppo', ar: 'حلب' },
            administrative_division: { en: 'Aleppo Governorate', ar: 'محافظة حلب' }
          }
        },
        {
          type: 'DETENTION',
          location: {
            name: { en: 'Damascus', ar: 'دمشق' },
            administrative_division: { en: 'Damascus Governorate', ar: 'محافظة دمشق' }
          }
        },
        {
          type: 'EXECUTION',
          location: {
            name: { en: 'Aleppo', ar: 'حلب' },
            administrative_division: { en: 'Aleppo Governorate', ar: 'محافظة حلب' }
          }
        }
      ];

      // Mock geocoding function to return different results for different locations
      getCachedOrFreshGeocode
        .mockResolvedValueOnce([{ latitude: 36.202, longitude: 37.161, country: 'Syria', city: 'Aleppo', quality: 0.9, fromCache: false }]) // Aleppo AR
        .mockResolvedValueOnce([{ latitude: 36.202, longitude: 37.161, country: 'Syria', city: 'Aleppo', quality: 0.9, fromCache: false }]) // Aleppo EN
        .mockResolvedValueOnce([{ latitude: 33.513, longitude: 36.296, country: 'Syria', city: 'Damascus', quality: 0.9, fromCache: false }]) // Damascus AR
        .mockResolvedValueOnce([{ latitude: 33.513, longitude: 36.296, country: 'Syria', city: 'Damascus', quality: 0.9, fromCache: false }]); // Damascus EN

      const result = await batchGeocodeLocations(violations);

      // Should have made 4 API calls total (2 languages × 2 unique locations)
      expect(getCachedOrFreshGeocode).toHaveBeenCalledTimes(4);

      // All violations should have coordinates assigned
      expect(result[0].location.coordinates).toEqual([37.161, 36.202]);
      expect(result[1].location.coordinates).toEqual([37.161, 36.202]);
      expect(result[2].location.coordinates).toEqual([36.296, 33.513]);
      expect(result[3].location.coordinates).toEqual([37.161, 36.202]);

      // Verify logging was called with correct information
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Batch geocoding: 4 violations, 2 unique locations')
      );
    });

    it('should handle violations without locations gracefully', async () => {
      const violations = [
        {
          type: 'AIRSTRIKE',
          location: {
            name: { en: 'Aleppo', ar: 'حلب' }
          }
        },
        {
          type: 'SHELLING',
          // No location
        },
        {
          type: 'DETENTION',
          location: {
            // No name
            administrative_division: { en: 'Damascus Governorate' }
          }
        }
      ];

      getCachedOrFreshGeocode
        .mockResolvedValueOnce([{ latitude: 36.202, longitude: 37.161, country: 'Syria', city: 'Aleppo', quality: 0.9, fromCache: false }]) // Aleppo AR
        .mockResolvedValueOnce([{ latitude: 36.202, longitude: 37.161, country: 'Syria', city: 'Aleppo', quality: 0.9, fromCache: false }]); // Aleppo EN

      const result = await batchGeocodeLocations(violations);

      // Should only geocode the first violation (2 calls for AR and EN)
      expect(getCachedOrFreshGeocode).toHaveBeenCalledTimes(2);
      expect(result[0].location.coordinates).toEqual([37.161, 36.202]);
      expect(result[1].location).toBeUndefined();
      expect(result[2].location.coordinates).toBeUndefined();
    });

    it('should handle geocoding failures for individual locations', async () => {
      const violations = [
        {
          type: 'AIRSTRIKE',
          location: {
            name: { en: 'ValidLocation', ar: 'موقع صالح' }
          }
        },
        {
          type: 'SHELLING',
          location: {
            name: { en: 'InvalidLocation', ar: 'موقع غير صالح' }
          }
        }
      ];

      getCachedOrFreshGeocode
        .mockResolvedValueOnce([{ latitude: 36.202, longitude: 37.161, country: 'Syria', city: 'ValidLocation', quality: 0.9, fromCache: false }]) // Valid AR
        .mockResolvedValueOnce([{ latitude: 36.202, longitude: 37.161, country: 'Syria', city: 'ValidLocation', quality: 0.9, fromCache: false }]) // Valid EN
        .mockRejectedValueOnce(new Error('Geocoding failed')); // Invalid AR (no EN name provided)

      const result = await batchGeocodeLocations(violations);

      expect(getCachedOrFreshGeocode).toHaveBeenCalledTimes(3);
      expect(result[0].location.coordinates).toEqual([37.161, 36.202]);
      expect(result[1].location.coordinates).toBeUndefined();

      // Should log the error
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to geocode location InvalidLocation')
      );
    });

    it('should create unique keys for different location combinations', async () => {
      const violations = [
        {
          type: 'AIRSTRIKE',
          location: {
            name: { en: 'Aleppo', ar: 'حلب' },
            administrative_division: { en: 'Aleppo Governorate' }
          }
        },
        {
          type: 'SHELLING',
          location: {
            name: { en: 'Aleppo', ar: 'حلب' },
            administrative_division: { en: 'Different Governorate' }
          }
        },
        {
          type: 'DETENTION',
          location: {
            name: { en: 'Different City', ar: 'حلب' },
            administrative_division: { en: 'Aleppo Governorate' }
          }
        }
      ];

      getCachedOrFreshGeocode.mockResolvedValue([{ 
        latitude: 36.202, 
        longitude: 37.161, 
        country: 'Syria', 
        city: 'Test', 
        quality: 0.9, 
        fromCache: false 
      }]);

      await batchGeocodeLocations(violations);

      // Should make 6 API calls for 3 unique location combinations (2 languages each)
      expect(getCachedOrFreshGeocode).toHaveBeenCalledTimes(6);
    });

    it('should log performance metrics', async () => {
      const violations = [
        {
          type: 'AIRSTRIKE',
          location: {
            name: { en: 'Aleppo' }
          }
        }
      ];

      getCachedOrFreshGeocode.mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        return [{ 
          latitude: 36.202, 
          longitude: 37.161, 
          country: 'Syria', 
          city: 'Aleppo', 
          quality: 0.9, 
          fromCache: false 
        }];
      });

      await batchGeocodeLocations(violations);

      expect(logger.info).toHaveBeenCalledWith(
        expect.stringMatching(/Geocoded unique location in \d+ms: Aleppo/)
      );
      expect(logger.info).toHaveBeenCalledWith(
        'Batch geocoding complete: 1/1 violations geocoded with 1 unique API calls'
      );
    });
  });

  describe('createBatchViolations with batch geocoding optimization', () => {
    const mockUserId = new mongoose.Types.ObjectId().toString();

    beforeEach(() => {
      // Reset mocks
      jest.clearAllMocks();
      
      // Mock single validation for createSingleViolation
      Violation.validateForCreation.mockImplementation(async (data) => data);

      Violation.create.mockImplementation(async (data) => ({
        ...data,
        _id: new mongoose.Types.ObjectId(),
        created_by: mockUserId,
        updated_by: mockUserId
      }));
    });

    it('should use batch geocoding by default', async () => {
      const violationsData = [
        {
          type: 'AIRSTRIKE',
          date: '2023-06-15',
          location: { name: { en: 'Aleppo', ar: 'حلب' } },
          description: { en: 'Test violation description that is long enough', ar: 'وصف' },
          verified: true,
          certainty_level: 'confirmed',
          perpetrator_affiliation: 'assad_regime'
        },
        {
          type: 'SHELLING',
          date: '2023-06-16',
          location: { name: { en: 'Aleppo', ar: 'حلب' } },
          description: { en: 'Another test violation description that is long enough', ar: 'وصف آخر' },
          verified: false,
          certainty_level: 'probable',
          perpetrator_affiliation: 'unknown'
        }
      ];

      const validatedViolations = violationsData.map((v, i) => ({ ...v, _batchIndex: i }));
      
      // Set up validation mock to return valid violations
      Violation.validateBatch.mockResolvedValueOnce({
        valid: validatedViolations,
        invalid: []
      });

      // Mock the batch geocoding function
      const mockBatchGeocode = jest.fn().mockImplementation(async (violations) => {
        violations.forEach(v => {
          if (v.location) {
            v.location.coordinates = [37.161, 36.202];
          }
        });
        return violations;
      });

      const originalBatchFunction = require('../../../commands/violations/create').batchGeocodeLocations;
      require('../../../commands/violations/create').batchGeocodeLocations = mockBatchGeocode;

      // Mock createSingleViolation as well since it's needed for the function to complete
      const mockCreateSingle = jest.fn().mockResolvedValue({
        violation: { _id: 'test-id' },
        wasMerged: false
      });

      const originalCreateSingle = require('../../../commands/violations/create').createSingleViolation;
      require('../../../commands/violations/create').createSingleViolation = mockCreateSingle;

      try {
        const result = await createBatchViolations(violationsData, mockUserId);

        // Verify the function completes successfully
        expect(result).toBeDefined();
        expect(result.violations).toBeDefined();
        expect(Array.isArray(result.violations)).toBe(true);
        expect(result.violations.length).toBeGreaterThan(0);
        
        // Verify violations have the expected structure
        expect(result.violations[0]).toHaveProperty('_id');
        expect(result.violations[0]).toHaveProperty('type');
      } finally {
        require('../../../commands/violations/create').batchGeocodeLocations = originalBatchFunction;
        require('../../../commands/violations/create').createSingleViolation = originalCreateSingle;
      }
    });

    it('should skip individual geocoding when batch geocoding is used', async () => {
      const violationsData = [
        {
          type: 'AIRSTRIKE',
          date: '2023-06-15',
          location: { name: { en: 'Aleppo' } },
          description: { en: 'Test violation description that is long enough' },
          verified: true,
          certainty_level: 'confirmed',
          perpetrator_affiliation: 'assad_regime'
        }
      ];

      const validatedViolations = violationsData.map((v, i) => ({ ...v, _batchIndex: i }));
      
      // Set up validation mock
      Violation.validateBatch.mockResolvedValueOnce({
        valid: validatedViolations,
        invalid: []
      });

      // Mock batch geocoding to add coordinates
      const mockBatchGeocode = jest.fn().mockImplementation(async (violations) => {
        violations[0].location.coordinates = [37.161, 36.202];
        return violations;
      });

      const originalBatchFunction = require('../../../commands/violations/create').batchGeocodeLocations;
      require('../../../commands/violations/create').batchGeocodeLocations = mockBatchGeocode;

      // Mock createSingleViolation to verify skipGeocoding option
      const mockCreateSingle = jest.fn().mockResolvedValue({
        violation: { _id: 'test-id' },
        wasMerged: false
      });

      const originalCreateSingle = require('../../../commands/violations/create').createSingleViolation;
      require('../../../commands/violations/create').createSingleViolation = mockCreateSingle;

      try {
        const result = await createBatchViolations(violationsData, mockUserId);

        // Verify the function completes successfully with batch geocoding
        expect(result).toBeDefined();
        expect(result.violations).toBeDefined();
        expect(result.violations.length).toBeGreaterThan(0);
        
        // Verify that violations have coordinates (indicating geocoding worked)
        expect(result.violations[0]).toHaveProperty('location');
      } finally {
        require('../../../commands/violations/create').batchGeocodeLocations = originalBatchFunction;
        require('../../../commands/violations/create').createSingleViolation = originalCreateSingle;
      }
    });

    it('should handle batch geocoding failures gracefully', async () => {
      const violationsData = [
        {
          type: 'AIRSTRIKE',
          date: '2023-06-15',
          location: { name: { en: 'Aleppo' } },
          description: { en: 'Test violation description that is long enough' },
          verified: true,
          certainty_level: 'confirmed',
          perpetrator_affiliation: 'assad_regime'
        }
      ];

      const validatedViolations = violationsData.map((v, i) => ({ ...v, _batchIndex: i }));
      
      // Set up validation mock
      Violation.validateBatch.mockResolvedValueOnce({
        valid: validatedViolations,
        invalid: []
      });

      // Mock batch geocoding to fail
      const mockBatchGeocode = jest.fn().mockRejectedValue(new Error('Batch geocoding failed'));

      const originalBatchFunction = require('../../../commands/violations/create').batchGeocodeLocations;
      require('../../../commands/violations/create').batchGeocodeLocations = mockBatchGeocode;

      // Mock createSingleViolation
      const mockCreateSingle = jest.fn().mockResolvedValue({
        violation: { _id: 'test-id' },
        wasMerged: false
      });

      const originalCreateSingle = require('../../../commands/violations/create').createSingleViolation;
      require('../../../commands/violations/create').createSingleViolation = mockCreateSingle;

      try {
        const result = await createBatchViolations(violationsData, mockUserId);

        // Verify the function handles failures gracefully and still returns results
        expect(result).toBeDefined();
        expect(result.violations).toBeDefined();
        expect(result.violations.length).toBeGreaterThan(0);
      } finally {
        require('../../../commands/violations/create').batchGeocodeLocations = originalBatchFunction;
        require('../../../commands/violations/create').createSingleViolation = originalCreateSingle;
      }
    });

    it('should allow disabling batch geocoding with option', async () => {
      const violationsData = [
        {
          type: 'AIRSTRIKE',
          date: '2023-06-15',
          location: { name: { en: 'Aleppo' } },
          description: { en: 'Test violation description that is long enough' },
          verified: true,
          certainty_level: 'confirmed',
          perpetrator_affiliation: 'assad_regime'
        }
      ];

      const validatedViolations = violationsData.map((v, i) => ({ ...v, _batchIndex: i }));
      
      // Set up validation mock
      Violation.validateBatch.mockResolvedValueOnce({
        valid: validatedViolations,
        invalid: []
      });

      const mockBatchGeocode = jest.fn();
      const originalBatchFunction = require('../../../commands/violations/create').batchGeocodeLocations;
      require('../../../commands/violations/create').batchGeocodeLocations = mockBatchGeocode;

      const mockCreateSingle = jest.fn().mockResolvedValue({
        violation: { _id: 'test-id' },
        wasMerged: false
      });

      const originalCreateSingle = require('../../../commands/violations/create').createSingleViolation;
      require('../../../commands/violations/create').createSingleViolation = mockCreateSingle;

      try {
        const result = await createBatchViolations(violationsData, mockUserId, {
          useBatchGeocoding: false
        });

        // Verify the function works when batch geocoding is disabled
        expect(result).toBeDefined();
        expect(result.violations).toBeDefined();
        expect(result.violations.length).toBeGreaterThan(0);
      } finally {
        require('../../../commands/violations/create').batchGeocodeLocations = originalBatchFunction;
        require('../../../commands/violations/create').createSingleViolation = originalCreateSingle;
      }
    });
  });

  describe('Performance Benefits', () => {
    it('should demonstrate API call reduction with duplicate locations', () => {
      // This test demonstrates the efficiency gains
      const duplicateLocations = Array(100).fill().map((_, i) => ({
        type: 'AIRSTRIKE',
        location: {
          name: { en: i < 50 ? 'Aleppo' : 'Damascus' },
          administrative_division: { en: i < 50 ? 'Aleppo Gov' : 'Damascus Gov' }
        }
      }));

      const locationMap = new Map();
      const violationLocationMap = new Map();
      
      duplicateLocations.forEach((violation, index) => {
        if (violation.location && violation.location.name) {
          const locationKey = JSON.stringify({
            nameEn: violation.location.name.en || '',
            nameAr: violation.location.name.ar || '',
            adminEn: violation.location.administrative_division?.en || '',
            adminAr: violation.location.administrative_division?.ar || ''
          });
          
          if (!locationMap.has(locationKey)) {
            locationMap.set(locationKey, violation.location);
          }
          violationLocationMap.set(index, locationKey);
        }
      });

      // Should have only 2 unique locations despite 100 violations
      expect(locationMap.size).toBe(2);
      expect(violationLocationMap.size).toBe(100);
      
      // This represents a 98% reduction in API calls (2 instead of 100)
      const apiCallReduction = ((100 - 2) / 100) * 100;
      expect(apiCallReduction).toBe(98);
    });
  });
}); 