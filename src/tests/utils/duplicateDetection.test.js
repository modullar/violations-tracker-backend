const {
  isDuplicate,
  calculateDistance,
  compareDates,
  mergeSourceUrls,
  mergeMediaLinks,
  mergeTags,
  mergeVictims,
  SIMILARITY_THRESHOLD
} = require('../../utils/duplicateDetection');

describe('Duplicate Detection Utils', () => {
  describe('calculateDistance', () => {
    it('should calculate distance between two points correctly', () => {
      // Distance between New York and Los Angeles
      const distance = calculateDistance(40.7128, -74.0060, 34.0522, -118.2437);
      expect(distance).toBeCloseTo(3935746, 0); // Use actual calculated distance
    });

    it('should return 0 for same coordinates', () => {
      const distance = calculateDistance(40.7128, -74.0060, 40.7128, -74.0060);
      expect(distance).toBe(0);
    });
  });

  describe('compareDates', () => {
    it('should return true for same dates', () => {
      const date1 = new Date('2023-05-15T10:30:00Z');
      const date2 = new Date('2023-05-15T15:45:00Z');
      expect(compareDates(date1, date2)).toBe(true);
    });

    it('should return false for different dates', () => {
      const date1 = new Date('2023-05-15');
      const date2 = new Date('2023-05-16');
      expect(compareDates(date1, date2)).toBe(false);
    });
  });

  describe('isDuplicate', () => {
    const baseViolation = {
      type: 'AIRSTRIKE',
      date: new Date('2023-05-15'),
      perpetrator_affiliation: 'assad_regime',
      location: {
        coordinates: [36.2021, 37.1343] // Aleppo coordinates
      },
      casualties: 5,
      description: {
        en: 'Airstrike on residential area causing multiple casualties'
      }
    };

    it('should detect exact match duplicates', () => {
      const violation2 = { ...baseViolation };
      const result = isDuplicate(baseViolation, violation2);
      
      expect(result.isDuplicate).toBe(true);
      expect(result.matchDetails.exactMatch).toBe(true);
      expect(result.matchDetails.sameType).toBe(true);
      expect(result.matchDetails.sameDate).toBe(true);
      expect(result.matchDetails.samePerpetrator).toBe(true);
      expect(result.matchDetails.nearbyLocation).toBe(true);
      expect(result.matchDetails.sameCasualties).toBe(true);
    });

    it('should detect similarity-based duplicates', () => {
      const violation2 = {
        ...baseViolation,
        type: 'SHELLING', // Different type
        casualties: 3, // Different casualties
        description: {
          en: 'Airstrike on residential area causing multiple casualties and damage' // Very similar description
        }
      };
      
      const result = isDuplicate(baseViolation, violation2);
      
      expect(result.isDuplicate).toBe(true);
      expect(result.matchDetails.exactMatch).toBe(false);
      expect(result.matchDetails.similarityMatch).toBe(true);
      expect(result.matchDetails.similarity).toBeGreaterThan(SIMILARITY_THRESHOLD);
    });

    it('should not detect duplicates for different violations', () => {
      const violation2 = {
        type: 'DETENTION',
        date: new Date('2023-06-15'),
        perpetrator_affiliation: 'isis',
        location: {
          coordinates: [36.3, 37.2] // Different location
        },
        casualties: 0,
        description: {
          en: 'Detention of civilians in prison facility'
        }
      };
      
      const result = isDuplicate(baseViolation, violation2);
      
      expect(result.isDuplicate).toBe(false);
      expect(result.matchDetails.exactMatch).toBe(false);
      expect(result.matchDetails.similarityMatch).toBe(false);
    });

    it('should handle violations without coordinates', () => {
      const violation1 = { ...baseViolation };
      delete violation1.location.coordinates;
      
      const violation2 = { ...baseViolation };
      delete violation2.location.coordinates;
      
      const result = isDuplicate(violation1, violation2);
      
      expect(result.matchDetails.distance).toBe(Infinity);
      expect(result.matchDetails.nearbyLocation).toBe(false);
    });
  });

  describe('mergeSourceUrls', () => {
    it('should merge and deduplicate URLs', () => {
      const existing = ['http://example.com/1', 'http://example.com/2'];
      const newUrls = ['http://example.com/2', 'http://example.com/3'];
      
      const result = mergeSourceUrls(existing, newUrls);
      
      expect(result).toEqual([
        'http://example.com/1',
        'http://example.com/2',
        'http://example.com/3'
      ]);
    });

    it('should handle empty arrays', () => {
      const result = mergeSourceUrls([], []);
      expect(result).toEqual([]);
    });

    it('should filter out empty strings', () => {
      const existing = ['http://example.com/1', ''];
      const newUrls = ['', 'http://example.com/2'];
      
      const result = mergeSourceUrls(existing, newUrls);
      
      expect(result).toEqual([
        'http://example.com/1',
        'http://example.com/2'
      ]);
    });
  });

  describe('mergeMediaLinks', () => {
    it('should merge and deduplicate media links', () => {
      const existing = ['http://media.com/1', 'http://media.com/2'];
      const newLinks = ['http://media.com/2', 'http://media.com/3'];
      
      const result = mergeMediaLinks(existing, newLinks);
      
      expect(result).toEqual([
        'http://media.com/1',
        'http://media.com/2',
        'http://media.com/3'
      ]);
    });
  });

  describe('mergeTags', () => {
    it('should merge tags without duplicates', () => {
      const existing = [
        { en: 'civilian', ar: 'مدني' },
        { en: 'airstrike', ar: 'غارة جوية' }
      ];
      const newTags = [
        { en: 'airstrike', ar: 'غارة جوية' }, // Duplicate
        { en: 'residential', ar: 'سكني' }
      ];
      
      const result = mergeTags(existing, newTags);
      
      expect(result).toHaveLength(3);
      expect(result).toContainEqual({ en: 'civilian', ar: 'مدني' });
      expect(result).toContainEqual({ en: 'airstrike', ar: 'غارة جوية' });
      expect(result).toContainEqual({ en: 'residential', ar: 'سكني' });
    });
  });

  describe('mergeVictims', () => {
    it('should merge victims without duplicates', () => {
      const existing = [
        { age: 25, gender: 'male', status: 'civilian' },
        { age: 30, gender: 'female', status: 'civilian' }
      ];
      const newVictims = [
        { age: 25, gender: 'male', status: 'civilian' }, // Duplicate
        { age: 35, gender: 'male', status: 'civilian' }
      ];
      
      const result = mergeVictims(existing, newVictims);
      
      expect(result).toHaveLength(3);
      expect(result).toContainEqual({ age: 25, gender: 'male', status: 'civilian' });
      expect(result).toContainEqual({ age: 30, gender: 'female', status: 'civilian' });
      expect(result).toContainEqual({ age: 35, gender: 'male', status: 'civilian' });
    });

    it('should handle empty arrays', () => {
      const result = mergeVictims([], []);
      expect(result).toEqual([]);
    });
  });
});