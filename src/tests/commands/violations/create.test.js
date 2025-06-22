// Manual mocks to avoid global setup dependencies
jest.mock('node-geocoder', () => {
  return () => ({
    geocode: jest.fn()
  });
});

jest.mock('../../../utils/geocoder', () => ({
  geocodeLocation: jest.fn()
}));

jest.mock('../../../utils/duplicateChecker', () => ({
  checkForDuplicates: jest.fn()
}));

jest.mock('../../../commands/violations/merge', () => ({
  mergeWithExistingViolation: jest.fn()
}));

jest.mock('../../../config/logger', () => ({
  info: jest.fn(),
  error: jest.fn()
}));

const mongoose = require('mongoose');
const { createSingleViolation, createBatchViolations, geocodeLocationData } = require('../../../commands/violations/create');
const Violation = require('../../../models/Violation');
const ErrorResponse = require('../../../utils/errorResponse');

const { geocodeLocation } = require('../../../utils/geocoder');
const { checkForDuplicates } = require('../../../utils/duplicateChecker');
const { mergeWithExistingViolation } = require('../../../commands/violations/merge');

describe('Violation Create Command', () => {
  const mockUserId = new mongoose.Types.ObjectId().toString();

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Default mock for checkForDuplicates - no duplicates found
    checkForDuplicates.mockResolvedValue({
      hasDuplicates: false,
      duplicates: [],
      bestMatch: null
    });
  });

  describe('geocodeLocationData', () => {
    it('should geocode location successfully with both languages', async () => {
      const location = {
        name: {
          ar: 'بستان القصر',
          en: 'Bustan al-Qasr'
        },
        administrative_division: {
          ar: 'حلب',
          en: 'Aleppo'
        }
      };

      geocodeLocation
        .mockImplementationOnce(async () => [{ // Arabic call
          latitude: 36.186764,
          longitude: 37.1441285,
          quality: 0.9
        }])
        .mockImplementationOnce(async () => [{ // English call
          latitude: 36.186764,
          longitude: 37.1441285,
          quality: 0.8
        }]);

      const result = await geocodeLocationData(location);

      expect(result).toEqual([37.1441285, 36.186764]);
      expect(geocodeLocation).toHaveBeenCalledTimes(2);
      expect(geocodeLocation).toHaveBeenCalledWith('بستان القصر', 'حلب');
      expect(geocodeLocation).toHaveBeenCalledWith('Bustan al-Qasr', 'Aleppo');
    });

    it('should use English result when Arabic fails', async () => {
      const location = {
        name: {
          ar: 'موقع غير موجود',
          en: 'Valid Location'
        },
        administrative_division: {
          ar: '',
          en: 'Damascus'
        }
      };

      geocodeLocation
        .mockImplementationOnce(async () => []) // Arabic fails
        .mockImplementationOnce(async () => [{ // English succeeds
          latitude: 33.5138,
          longitude: 36.2765,
          quality: 0.8
        }]);

      const result = await geocodeLocationData(location);

      expect(result).toEqual([36.2765, 33.5138]);
      expect(geocodeLocation).toHaveBeenCalledTimes(2);
    });

    it('should throw error when location name is missing', async () => {
      const location = {
        administrative_division: {
          ar: 'دمشق',
          en: 'Damascus'
        }
      };

      await expect(geocodeLocationData(location)).rejects.toThrow('Location name is required');
    });

    it('should throw error when both geocoding attempts fail', async () => {
      const location = {
        name: {
          ar: 'موقع غير موجود',
          en: 'Non-existent Location'
        }
      };

      geocodeLocation
        .mockImplementationOnce(async () => []) // Arabic fails
        .mockImplementationOnce(async () => []); // English fails

      await expect(geocodeLocationData(location)).rejects.toThrow(
        'Could not find valid coordinates for location. Tried both Arabic (موقع غير موجود) and English (Non-existent Location) names'
      );
    });

    it('should handle geocoding service errors', async () => {
      const location = {
        name: {
          ar: 'دمشق',
          en: 'Damascus'
        }
      };

      geocodeLocation.mockRejectedValue(new Error('Geocoding service unavailable'));

      await expect(geocodeLocationData(location)).rejects.toThrow(
        'Geocoding failed: Geocoding service unavailable'
      );
    });
  });

  describe('createSingleViolation', () => {
    const baseViolationData = {
      type: 'AIRSTRIKE',
      date: '2023-06-15',
      location: {
        name: {
          en: 'Test Location',
          ar: 'موقع اختبار'
        },
        administrative_division: {
          en: 'Test Division',
          ar: 'قسم الاختبار'
        }
      },
      description: {
        en: 'Test violation description that is long enough to meet requirements',
        ar: 'وصف انتهاك الاختبار'
      },
      source: {
        en: 'Test Source',
        ar: 'مصدر الاختبار'
      },
      source_url: {
        en: 'https://example.com/en/report',
        ar: 'https://example.com/ar/report'
      },
      verified: true,
      certainty_level: 'confirmed',
      verification_method: {
        en: 'Video evidence and witness testimony',
        ar: 'أدلة فيديو وشهادة شهود'
      },
      perpetrator: {
        en: 'Test Perpetrator',
        ar: 'مرتكب الاختبار'
      },
      perpetrator_affiliation: 'assad_regime',
      casualties: 5
    };

    beforeEach(() => {
      geocodeLocation.mockResolvedValue([{
        latitude: 36.2021047,
        longitude: 37.1342603,
        quality: 0.9
      }]);
    });

    it('should create a violation with valid data and no duplicates found', async () => {
      const mockCreatedViolation = { 
        ...baseViolationData, 
        _id: 'mock-id', 
        created_by: mockUserId,
        location: {
          ...baseViolationData.location,
          coordinates: [37.1342603, 36.2021047]
        }
      };
      
      Violation.create = jest.fn().mockResolvedValue(mockCreatedViolation);

      const result = await createSingleViolation(baseViolationData, mockUserId);

      expect(result.violation).toEqual(mockCreatedViolation);
      expect(result.wasMerged).toBe(false);
      expect(checkForDuplicates).toHaveBeenCalled();
      expect(Violation.create).toHaveBeenCalled();
      
      // Verify the data passed to create has been processed
      const createCallArgs = Violation.create.mock.calls[0][0];
      expect(createCallArgs.date).toBeInstanceOf(Date);
      expect(createCallArgs.location.coordinates).toEqual([37.1342603, 36.2021047]);
      expect(createCallArgs.created_by).toBe(mockUserId);
      expect(createCallArgs.updated_by).toBe(mockUserId);
    });

    it('should merge with existing violation when duplicate found and mergeDuplicates=true', async () => {
      const mockExistingViolation = {
        _id: 'existing-id',
        type: 'AIRSTRIKE',
        date: new Date('2023-06-15'),
        casualties: 3
      };

      const mockMergedViolation = {
        ...mockExistingViolation,
        casualties: 5, // Updated from new violation
        updated_by: mockUserId
      };

      // Mock duplicate found
      checkForDuplicates.mockResolvedValue({
        hasDuplicates: true,
        duplicates: [{
          violation: mockExistingViolation,
          similarity: 0.9,
          exactMatch: false
        }],
        bestMatch: {
          violation: mockExistingViolation,
          similarity: 0.9,
          exactMatch: false
        }
      });

      mergeWithExistingViolation.mockResolvedValue(mockMergedViolation);

      const result = await createSingleViolation(baseViolationData, mockUserId);

      expect(result.violation).toEqual(mockMergedViolation);
      expect(result.wasMerged).toBe(true);
      expect(result.duplicateInfo).toBeDefined();
      expect(result.duplicateInfo.similarity).toBe(0.9);
      expect(result.duplicateInfo.originalId).toBe('existing-id');
      
      expect(checkForDuplicates).toHaveBeenCalled();
      expect(mergeWithExistingViolation).toHaveBeenCalledWith(
        expect.any(Object), // sanitized data
        mockExistingViolation,
        mockUserId,
        { preferNew: true }
      );
      expect(Violation.create).not.toHaveBeenCalled();
    });

    it('should throw error when duplicate found and mergeDuplicates=false', async () => {
      const mockExistingViolation = {
        _id: 'existing-id',
        type: 'AIRSTRIKE',
        date: new Date('2023-06-15')
      };

      // Mock duplicate found
      checkForDuplicates.mockResolvedValue({
        hasDuplicates: true,
        duplicates: [{
          violation: mockExistingViolation,
          similarity: 0.9,
          exactMatch: false
        }],
        bestMatch: {
          violation: mockExistingViolation,
          similarity: 0.9,
          exactMatch: false
        }
      });

      await expect(createSingleViolation(baseViolationData, mockUserId, {
        mergeDuplicates: false
      })).rejects.toThrow(ErrorResponse);

      expect(checkForDuplicates).toHaveBeenCalled();
      expect(mergeWithExistingViolation).not.toHaveBeenCalled();
      expect(Violation.create).not.toHaveBeenCalled();
    });

    it('should skip duplicate checking when checkDuplicates=false', async () => {
      const mockCreatedViolation = { 
        ...baseViolationData, 
        _id: 'mock-id', 
        created_by: mockUserId 
      };
      
      Violation.create = jest.fn().mockResolvedValue(mockCreatedViolation);

      const result = await createSingleViolation(baseViolationData, mockUserId, {
        checkDuplicates: false
      });

      expect(result.violation).toEqual(mockCreatedViolation);
      expect(result.wasMerged).toBe(false);
      expect(checkForDuplicates).not.toHaveBeenCalled();
      expect(Violation.create).toHaveBeenCalled();
    });

    it('should use custom duplicate threshold', async () => {
      const mockCreatedViolation = { 
        ...baseViolationData, 
        _id: 'mock-id', 
        created_by: mockUserId 
      };
      
      Violation.create = jest.fn().mockResolvedValue(mockCreatedViolation);

      await createSingleViolation(baseViolationData, mockUserId, {
        duplicateThreshold: 0.9
      });

      expect(checkForDuplicates).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          similarityThreshold: 0.9,
          limit: 5
        })
      );
    });

    it('should handle geocoding errors', async () => {
      const violationData = {
        type: 'AIRSTRIKE',
        location: {
          name: {
            en: 'Invalid Location',
            ar: 'موقع غير صالح'
          }
        }
      };

      geocodeLocation.mockResolvedValue([]);

      await expect(createSingleViolation(violationData, mockUserId))
        .rejects.toThrow('Could not find valid coordinates for location');
    });
  });

  describe('createBatchViolations', () => {
    it('should create multiple violations successfully with no duplicates', async () => {
      const violationsData = [
        {
          type: 'AIRSTRIKE',
          date: '2023-06-15',
          location: {
            name: { en: 'Location 1', ar: 'موقع 1' }
          },
          description: { en: 'Description 1 that is long enough to meet requirements', ar: 'وصف 1' },
          source: { en: 'Source 1', ar: 'مصدر 1' },
          verified: true,
          certainty_level: 'confirmed',
          verification_method: { en: 'Video evidence', ar: 'أدلة فيديو' },
          perpetrator: { en: 'Perpetrator 1', ar: 'مرتكب 1' },
          perpetrator_affiliation: 'assad_regime'
        },
        {
          type: 'SHELLING',
          date: '2023-06-16',
          location: {
            name: { en: 'Location 2', ar: 'موقع 2' }
          },
          description: { en: 'Description 2 that is long enough to meet requirements', ar: 'وصف 2' },
          source: { en: 'Source 2', ar: 'مصدر 2' },
          verified: false,
          certainty_level: 'possible',
          perpetrator: { en: 'Perpetrator 2', ar: 'مرتكب 2' },
          perpetrator_affiliation: 'unknown'
        }
      ];

      geocodeLocation.mockResolvedValue([{
        latitude: 36.2021047,
        longitude: 37.1342603,
        quality: 0.9
      }]);

      const mockCreatedViolations = violationsData.map((v, i) => ({
        ...v,
        _id: `mock-id-${i}`,
        created_by: mockUserId,
        location: { ...v.location, coordinates: [37.1342603, 36.2021047] }
      }));

      Violation.create = jest.fn()
        .mockResolvedValueOnce(mockCreatedViolations[0])
        .mockResolvedValueOnce(mockCreatedViolations[1]);

      const result = await createBatchViolations(violationsData, mockUserId);

      expect(result.violations).toHaveLength(2);
      expect(result.created).toHaveLength(2);
      expect(result.merged).toHaveLength(0);
      expect(result.errors).toBeUndefined();
      expect(checkForDuplicates).toHaveBeenCalledTimes(2);
    });

    it('should handle mixed created and merged violations in batch', async () => {
      const violationsData = [
        {
          type: 'AIRSTRIKE',
          date: '2023-06-15',
          location: { name: { en: 'Location 1', ar: 'موقع 1' } },
          description: { en: 'Description 1 that is long enough to meet requirements', ar: 'وصف 1' },
          source: { en: 'Source 1', ar: 'مصدر 1' },
          verified: true,
          certainty_level: 'confirmed',
          verification_method: { en: 'Video evidence', ar: 'أدلة فيديو' },
          perpetrator_affiliation: 'assad_regime'
        },
        {
          type: 'SHELLING',
          date: '2023-06-16',
          location: { name: { en: 'Location 2', ar: 'موقع 2' } },
          description: { en: 'Description 2 that is long enough to meet requirements', ar: 'وصف 2' },
          source: { en: 'Source 2', ar: 'مصدر 2' },
          verified: false,
          certainty_level: 'possible',
          perpetrator_affiliation: 'unknown'
        }
      ];

      geocodeLocation.mockResolvedValue([{
        latitude: 36.2021047,
        longitude: 37.1342603,
        quality: 0.9
      }]);

      const mockCreatedViolation = {
        ...violationsData[0],
        _id: 'created-id',
        created_by: mockUserId
      };

      const mockExistingViolation = {
        _id: 'existing-id',
        type: 'SHELLING',
        casualties: 2
      };

      const mockMergedViolation = {
        ...mockExistingViolation,
        casualties: 3,
        updated_by: mockUserId
      };

      // First violation: no duplicates, second violation: duplicate found
      checkForDuplicates
        .mockResolvedValueOnce({
          hasDuplicates: false,
          duplicates: [],
          bestMatch: null
        })
        .mockResolvedValueOnce({
          hasDuplicates: true,
          duplicates: [{ violation: mockExistingViolation, similarity: 0.8 }],
          bestMatch: { violation: mockExistingViolation, similarity: 0.8, exactMatch: false }
        });

      Violation.create = jest.fn().mockResolvedValue(mockCreatedViolation);
      mergeWithExistingViolation.mockResolvedValue(mockMergedViolation);

      const result = await createBatchViolations(violationsData, mockUserId);

      expect(result.violations).toHaveLength(2);
      expect(result.created).toHaveLength(1);
      expect(result.merged).toHaveLength(1);
      expect(result.merged[0].duplicateInfo.similarity).toBe(0.8);
      expect(result.errors).toBeUndefined();
    });

    it('should handle partial failures in batch creation', async () => {
      const violationsData = [
        {
          type: 'AIRSTRIKE',
          date: '2023-06-15',
          location: {
            name: { en: 'Valid Location', ar: 'موقع صالح' }
          },
          description: { en: 'Description that is long enough to meet requirements', ar: 'وصف' },
          source: { en: 'Source', ar: 'مصدر' },
          verified: true,
          certainty_level: 'confirmed',
          verification_method: { en: 'Video evidence', ar: 'أدلة فيديو' },
          perpetrator: { en: 'Perpetrator', ar: 'مرتكب' },
          perpetrator_affiliation: 'assad_regime'
        },
        {
          type: 'SHELLING',
          date: '2023-06-16',
          // Missing location.name - should fail
          location: {},
          description: { en: 'Description that is long enough to meet requirements', ar: 'وصف' }
        }
      ];

      geocodeLocation.mockResolvedValue([{
        latitude: 36.2021047,
        longitude: 37.1342603,
        quality: 0.9
      }]);

      const result = await createBatchViolations(violationsData, mockUserId);

      expect(result.violations.length).toBe(1);
      expect(result.errors).toBeDefined();
      expect(result.errors.length).toBe(1);
      expect(result.errors[0].index).toBe(1);
    });

    it('should pass through batch options correctly', async () => {
      const violationsData = [{
        type: 'AIRSTRIKE',
        date: '2023-06-15',
        location: { name: { en: 'Location', ar: 'موقع' } },
        description: { en: 'Description that is long enough to meet requirements', ar: 'وصف' },
        perpetrator_affiliation: 'assad_regime'
      }];

      geocodeLocation.mockResolvedValue([{
        latitude: 36.2021047,
        longitude: 37.1342603,
        quality: 0.9
      }]);

      Violation.create = jest.fn().mockResolvedValue({ _id: 'test-id' });

      await createBatchViolations(violationsData, mockUserId, {
        checkDuplicates: false,
        duplicateThreshold: 0.9
      });

      // Since checkDuplicates is false, it shouldn't call checkForDuplicates
      expect(checkForDuplicates).not.toHaveBeenCalled();
    });

    it('should throw error when input is not an array', async () => {
      const invalidData = { type: 'AIRSTRIKE' };

      await expect(createBatchViolations(invalidData, mockUserId))
        .rejects.toThrow(new ErrorResponse('Request body must be an array of violations', 400));
    });

    it('should throw error when array is empty', async () => {
      await expect(createBatchViolations([], mockUserId))
        .rejects.toThrow(new ErrorResponse('At least one violation must be provided', 400));
    });

    it('should throw error when all violations fail validation', async () => {
      const violationsData = [
        { type: 'AIRSTRIKE', location: {} }, // Missing location.name
        { type: 'SHELLING' } // Missing location entirely
      ];

      await expect(createBatchViolations(violationsData, mockUserId))
        .rejects.toThrow(new ErrorResponse('All violations failed validation', 400));
    });
  });
});