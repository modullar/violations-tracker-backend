// Manual mocks to avoid global setup dependencies
jest.mock('node-geocoder', () => {
  return () => ({
    geocode: jest.fn()
  });
});

jest.mock('../../../utils/geocoder', () => ({
  geocodeLocation: jest.fn()
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

describe('Violation Create Command', () => {
  const mockUserId = new mongoose.Types.ObjectId().toString();

  beforeEach(() => {
    jest.clearAllMocks();
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
    it('should create a violation with valid data and location', async () => {
      const violationData = {
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
          en: 'Test violation description',
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
        perpetrator: {
          en: 'Test Perpetrator',
          ar: 'مرتكب الاختبار'
        },
        perpetrator_affiliation: 'assad_regime',
        casualties: 5
      };

      geocodeLocation.mockResolvedValue([{
        latitude: 36.2021047,
        longitude: 37.1342603,
        quality: 0.9
      }]);

      // Mock Violation.create
      const mockCreatedViolation = { ...violationData, _id: 'mock-id', created_by: mockUserId };
      Violation.create = jest.fn().mockResolvedValue(mockCreatedViolation);

      const result = await createSingleViolation(violationData, mockUserId);

      expect(result).toEqual(mockCreatedViolation);
      expect(Violation.create).toHaveBeenCalledWith({
        ...violationData,
        location: {
          ...violationData.location,
          coordinates: [37.1342603, 36.2021047]
        },
        created_by: mockUserId,
        updated_by: mockUserId
      });
    });

    it('should create a violation without location data', async () => {
      const violationData = {
        type: 'SHELLING',
        date: '2023-06-15',
        description: {
          en: 'Test violation without location',
          ar: 'انتهاك اختبار بدون موقع'
        },
        source: {
          en: 'Test Source',
          ar: 'مصدر الاختبار'
        },
        verified: false,
        certainty_level: 'reported'
      };

      const mockCreatedViolation = { ...violationData, _id: 'mock-id', created_by: mockUserId };
      Violation.create = jest.fn().mockResolvedValue(mockCreatedViolation);

      const result = await createSingleViolation(violationData, mockUserId);

      expect(result).toEqual(mockCreatedViolation);
      expect(geocodeLocation).not.toHaveBeenCalled();
      expect(Violation.create).toHaveBeenCalledWith({
        ...violationData,
        created_by: mockUserId,
        updated_by: mockUserId
      });
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
    it('should create multiple violations successfully', async () => {
      const violationsData = [
        {
          type: 'AIRSTRIKE',
          date: '2023-06-15',
          location: {
            name: { en: 'Location 1', ar: 'موقع 1' }
          },
          description: { en: 'Description 1', ar: 'وصف 1' },
          source: { en: 'Source 1', ar: 'مصدر 1' },
          verified: true,
          certainty_level: 'confirmed',
          perpetrator: { en: 'Perpetrator 1', ar: 'مرتكب 1' },
          perpetrator_affiliation: 'assad_regime'
        },
        {
          type: 'SHELLING',
          date: '2023-06-16',
          location: {
            name: { en: 'Location 2', ar: 'موقع 2' }
          },
          description: { en: 'Description 2', ar: 'وصف 2' },
          source: { en: 'Source 2', ar: 'مصدر 2' },
          verified: false,
          certainty_level: 'reported',
          perpetrator: { en: 'Perpetrator 2', ar: 'مرتكب 2' },
          perpetrator_affiliation: 'russian_forces'
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

      Violation.create = jest.fn().mockResolvedValue(mockCreatedViolations);

      const result = await createBatchViolations(violationsData, mockUserId);

      expect(result.violations).toEqual(mockCreatedViolations);
      expect(result.errors).toBeUndefined();
      expect(Violation.create).toHaveBeenCalledTimes(1);
    });

    it('should handle partial failures in batch creation', async () => {
      const violationsData = [
        {
          type: 'AIRSTRIKE',
          location: {
            name: { en: 'Valid Location', ar: 'موقع صالح' }
          },
          description: { en: 'Description', ar: 'وصف' },
          source: { en: 'Source', ar: 'مصدر' },
          verified: true,
          certainty_level: 'confirmed',
          perpetrator: { en: 'Perpetrator', ar: 'مرتكب' },
          perpetrator_affiliation: 'assad_regime'
        },
        {
          type: 'SHELLING',
          // Missing location.name - should fail
          location: {},
          description: { en: 'Description', ar: 'وصف' }
        },
        {
          type: 'SHOOTING',
          location: {
            name: { en: 'Another Valid', ar: 'آخر صالح' }
          },
          description: { en: 'Description', ar: 'وصف' },
          source: { en: 'Source', ar: 'مصدر' },
          verified: true,
          certainty_level: 'confirmed',
          perpetrator: { en: 'Perpetrator', ar: 'مرتكب' },
          perpetrator_affiliation: 'assad_regime'
        }
      ];

      geocodeLocation.mockResolvedValue([{
        latitude: 36.2021047,
        longitude: 37.1342603,
        quality: 0.9
      }]);

      const mockCreatedViolations = [
        { ...violationsData[0], _id: 'mock-id-0' },
        { ...violationsData[2], _id: 'mock-id-2' }
      ];

      Violation.create = jest.fn().mockResolvedValue(mockCreatedViolations);

      const result = await createBatchViolations(violationsData, mockUserId);

      expect(result.violations.length).toBe(2);
      expect(result.errors).toEqual([
        { index: 1, error: 'Location name is required' }
      ]);
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

    it('should handle geocoding failures in batch', async () => {
      const violationsData = [
        {
          type: 'AIRSTRIKE',
          location: {
            name: { en: 'Location 1', ar: 'موقع 1' }
          },
          description: { en: 'Description', ar: 'وصف' },
          source: { en: 'Source', ar: 'مصدر' },
          verified: true,
          certainty_level: 'confirmed',
          perpetrator: { en: 'Perpetrator', ar: 'مرتكب' },
          perpetrator_affiliation: 'assad_regime'
        }
      ];

      geocodeLocation.mockRejectedValue(new Error('Geocoding service error'));

      // Since all violations fail, it should throw an error
      await expect(createBatchViolations(violationsData, mockUserId))
        .rejects.toThrow(new ErrorResponse('All violations failed validation', 400));
    });
  });
});