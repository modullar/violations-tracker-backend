// Manual mocks to avoid global setup dependencies
jest.mock('../../models/Violation');
jest.mock('../../config/logger', () => ({
  info: jest.fn(),
  error: jest.fn()
}));

const mongoose = require('mongoose');
const {
  checkForDuplicates,
  findPotentialDuplicates,
  checkViolationsMatch,
  calculateDistance,
  compareDates,
  SIMILARITY_THRESHOLD,
  MAX_DISTANCE_METERS
} = require('../../utils/duplicateChecker');
const Violation = require('../../models/Violation');

describe('Duplicate Checker Utility', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('calculateDistance', () => {
    it('should calculate distance between two points correctly', () => {
      // Distance between Damascus and Aleppo (approximately 300km)
      const damascusLat = 33.5138;
      const damascusLon = 36.2765;
      const aleppoLat = 36.2021;
      const aleppoLon = 37.1343;

      const distance = calculateDistance(damascusLat, damascusLon, aleppoLat, aleppoLon);
      
      // Should be approximately 300,000 meters (300km)
      expect(distance).toBeGreaterThan(250000);
      expect(distance).toBeLessThan(350000);
    });

    it('should return 0 for identical coordinates', () => {
      const lat = 36.2021;
      const lon = 37.1343;

      const distance = calculateDistance(lat, lon, lat, lon);
      expect(distance).toBe(0);
    });

    it('should calculate small distances accurately', () => {
      // Two points very close together (about 100 meters apart)
      const lat1 = 36.2021;
      const lon1 = 37.1343;
      const lat2 = 36.2030; // About 0.0009 degrees difference
      const lon2 = 37.1343;

      const distance = calculateDistance(lat1, lon1, lat2, lon2);
      
      // Should be approximately 100 meters
      expect(distance).toBeGreaterThan(80);
      expect(distance).toBeLessThan(120);
    });
  });

  describe('compareDates', () => {
    it('should return true for same dates', () => {
      const date1 = new Date('2023-06-15T10:30:00Z');
      const date2 = new Date('2023-06-15T15:45:00Z');

      expect(compareDates(date1, date2)).toBe(true);
    });

    it('should return false for different dates', () => {
      const date1 = new Date('2023-06-15T10:30:00Z');
      const date2 = new Date('2023-06-16T10:30:00Z');

      expect(compareDates(date1, date2)).toBe(false);
    });

    it('should handle string dates', () => {
      const date1 = '2023-06-15';
      const date2 = '2023-06-15T23:59:59Z';

      expect(compareDates(date1, date2)).toBe(true);
    });

    it('should handle mixed date types', () => {
      const date1 = new Date('2023-06-15');
      const date2 = '2023-06-15';

      expect(compareDates(date1, date2)).toBe(true);
    });
  });

  describe('checkViolationsMatch', () => {
    const baseViolation = {
      type: 'AIRSTRIKE',
      date: '2023-06-15',
      perpetrator_affiliation: 'assad_regime',
      location: {
        coordinates: [37.1343, 36.2021]
      },
      casualties: 5,
      kidnapped_count: 0,
      detained_count: 0,
      injured_count: 3,
      displaced_count: 0,
      description: {
        en: 'Airstrike on residential area causing civilian casualties'
      }
    };

    it('should detect exact match', () => {
      const newViolation = { ...baseViolation };
      const existingViolation = { ...baseViolation };

      const result = checkViolationsMatch(newViolation, existingViolation);

      expect(result.isDuplicate).toBe(true);
      expect(result.exactMatch).toBe(true);
      expect(result.similarity).toBe(1.0);
      expect(result.matchDetails.sameType).toBe(true);
      expect(result.matchDetails.sameDate).toBe(true);
      expect(result.matchDetails.samePerpetrator).toBe(true);
      expect(result.matchDetails.nearbyLocation).toBe(true);
      expect(result.matchDetails.sameCasualties).toBe(true);
    });

    it('should detect high similarity match even with different details', () => {
      const newViolation = {
        ...baseViolation,
        casualties: 7, // Different casualty count
        location: {
          coordinates: [37.1350, 36.2025] // Slightly different coordinates (within 100m)
        }
      };

      const result = checkViolationsMatch(newViolation, baseViolation);

      expect(result.isDuplicate).toBe(true);
      expect(result.exactMatch).toBe(false);
      expect(result.similarity).toBe(1.0); // Same description
      expect(result.matchDetails.sameType).toBe(true);
      expect(result.matchDetails.sameDate).toBe(true);
      expect(result.matchDetails.samePerpetrator).toBe(true);
      expect(result.matchDetails.nearbyLocation).toBe(true);
      expect(result.matchDetails.sameCasualties).toBe(false);
    });

    it('should not match violations with different types', () => {
      const newViolation = {
        ...baseViolation,
        type: 'SHELLING',
        description: {
          en: 'Different shelling attack causing damage to buildings'
        }
      };

      const result = checkViolationsMatch(newViolation, baseViolation);

      expect(result.isDuplicate).toBe(false);
      expect(result.exactMatch).toBe(false);
      expect(result.matchDetails.sameType).toBe(false);
    });

    it('should not match violations with different dates', () => {
      const newViolation = {
        ...baseViolation,
        date: '2023-06-16',
        description: {
          en: 'Different incident on a different day with casualties'
        }
      };

      const result = checkViolationsMatch(newViolation, baseViolation);

      expect(result.isDuplicate).toBe(false);
      expect(result.exactMatch).toBe(false);
      expect(result.matchDetails.sameDate).toBe(false);
    });

    it('should not match violations with distant locations', () => {
      const newViolation = {
        ...baseViolation,
        location: {
          coordinates: [36.2765, 33.5138] // Damascus coordinates (far from Aleppo)
        },
        description: {
          en: 'Different attack in Damascus area with civilian impact'
        }
      };

      const result = checkViolationsMatch(newViolation, baseViolation);

      expect(result.isDuplicate).toBe(false);
      expect(result.exactMatch).toBe(false);
      expect(result.matchDetails.nearbyLocation).toBe(false);
      expect(result.matchDetails.distance).toBeGreaterThan(MAX_DISTANCE_METERS);
    });

    it('should match based on description similarity even with different details', () => {
      const newViolation = {
        ...baseViolation,
        type: 'SHELLING', // Different type
        casualties: 10, // Different casualties
        description: {
          en: 'Airstrike on residential area causing civilian casualties and damage' // Very similar description
        }
      };

      const result = checkViolationsMatch(newViolation, baseViolation);

      expect(result.isDuplicate).toBe(true);
      expect(result.exactMatch).toBe(false);
      expect(result.similarity).toBeGreaterThan(SIMILARITY_THRESHOLD);
    });

    it('should handle missing coordinates gracefully', () => {
      const newViolation = {
        ...baseViolation,
        location: {} // No coordinates
      };

      const result = checkViolationsMatch(newViolation, baseViolation);

      expect(result.matchDetails.distance).toBe(Infinity);
      expect(result.matchDetails.nearbyLocation).toBe(false);
    });

    it('should handle missing description gracefully', () => {
      const newViolation = {
        ...baseViolation,
        description: {} // No English description
      };

      const result = checkViolationsMatch(newViolation, baseViolation);

      expect(result.similarity).toBe(0);
    });
  });

  describe('findPotentialDuplicates', () => {
    const mockViolations = [
      {
        _id: 'violation1',
        type: 'AIRSTRIKE',
        date: new Date('2023-06-15'),
        perpetrator_affiliation: 'assad_regime',
        location: { coordinates: [37.1343, 36.2021] },
        casualties: 5,
        description: { en: 'Airstrike on residential area' }
      }
    ];

    beforeEach(() => {
      // Mock the find method with query builder
      const mockQuery = {
        limit: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(mockViolations)
      };
      Violation.find = jest.fn().mockReturnValue(mockQuery);
    });

    it('should find potential duplicates with default options', async () => {
      const newViolationData = {
        type: 'AIRSTRIKE',
        date: '2023-06-15',
        perpetrator_affiliation: 'assad_regime',
        location: { coordinates: [37.1343, 36.2021] },
        casualties: 5,
        description: { en: 'Airstrike on residential area causing casualties' }
      };

      const result = await findPotentialDuplicates(newViolationData);

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
      expect(Violation.find).toHaveBeenCalledWith({
        type: 'AIRSTRIKE',
        perpetrator_affiliation: 'assad_regime',
        date: expect.any(Object)
      });
    });

    it('should handle database errors', async () => {
      const mockQuery = {
        limit: jest.fn().mockReturnThis(),
        lean: jest.fn().mockRejectedValue(new Error('Database error'))
      };
      Violation.find = jest.fn().mockReturnValue(mockQuery);

      const newViolationData = {
        type: 'AIRSTRIKE',
        date: '2023-06-15',
        perpetrator_affiliation: 'assad_regime',
        description: { en: 'Test description' }
      };

      await expect(findPotentialDuplicates(newViolationData))
        .rejects.toThrow('Error finding potential duplicates: Database error');
    });
  });

  describe('checkForDuplicates', () => {
    beforeEach(() => {
      // Mock findPotentialDuplicates indirectly through Violation.find
      const mockQuery = {
        limit: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([])
      };
      Violation.find = jest.fn().mockReturnValue(mockQuery);
    });

    it('should return no duplicates when none found', async () => {
      const violationData = {
        type: 'AIRSTRIKE',
        date: '2023-06-15',
        perpetrator_affiliation: 'assad_regime',
        description: { en: 'Unique violation description' }
      };

      const result = await checkForDuplicates(violationData);

      expect(result.hasDuplicates).toBe(false);
      expect(result.duplicates).toEqual([]);
      expect(result.bestMatch).toBeNull();
    });
  });

  describe('Constants', () => {
    it('should export correct default values', () => {
      expect(SIMILARITY_THRESHOLD).toBe(0.75);
      expect(MAX_DISTANCE_METERS).toBe(100);
    });
  });
});
