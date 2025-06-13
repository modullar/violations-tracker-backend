// Manual mocks
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
const { updateViolation, hasLocationChanged } = require('../../../commands/violations/update');
const { geocodeLocationData } = require('../../../commands/violations/create');
const Violation = require('../../../models/Violation');
const ErrorResponse = require('../../../utils/errorResponse');

// Mock the geocodeLocationData function
jest.mock('../../../commands/violations/create', () => ({
  geocodeLocationData: jest.fn()
}));

describe('Violation Update Command', () => {
  const mockUserId = new mongoose.Types.ObjectId().toString();
  const mockViolationId = new mongoose.Types.ObjectId().toString();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('hasLocationChanged', () => {
    it('should return false when no new location provided', () => {
      const existingLocation = {
        name: { en: 'Old Location', ar: 'موقع قديم' },
        administrative_division: { en: 'Old Division', ar: 'قسم قديم' }
      };

      expect(hasLocationChanged(null, existingLocation)).toBe(false);
      expect(hasLocationChanged(undefined, existingLocation)).toBe(false);
    });

    it('should return true when location name changed', () => {
      const newLocation = {
        name: { en: 'New Location', ar: 'موقع جديد' },
        administrative_division: { en: 'Old Division', ar: 'قسم قديم' }
      };
      const existingLocation = {
        name: { en: 'Old Location', ar: 'موقع قديم' },
        administrative_division: { en: 'Old Division', ar: 'قسم قديم' }
      };

      expect(hasLocationChanged(newLocation, existingLocation)).toBe(true);
    });

    it('should return true when administrative division changed', () => {
      const newLocation = {
        name: { en: 'Old Location', ar: 'موقع قديم' },
        administrative_division: { en: 'New Division', ar: 'قسم جديد' }
      };
      const existingLocation = {
        name: { en: 'Old Location', ar: 'موقع قديم' },
        administrative_division: { en: 'Old Division', ar: 'قسم قديم' }
      };

      expect(hasLocationChanged(newLocation, existingLocation)).toBe(true);
    });

    it('should return false when location unchanged', () => {
      const newLocation = {
        name: { en: 'Same Location', ar: 'نفس الموقع' },
        administrative_division: { en: 'Same Division', ar: 'نفس القسم' }
      };
      const existingLocation = {
        name: { en: 'Same Location', ar: 'نفس الموقع' },
        administrative_division: { en: 'Same Division', ar: 'نفس القسم' }
      };

      expect(hasLocationChanged(newLocation, existingLocation)).toBe(false);
    });
  });

  describe('updateViolation', () => {
    it('should update violation without location change', async () => {
      const existingViolation = {
        _id: mockViolationId,
        type: 'AIRSTRIKE',
        location: {
          name: { en: 'Location', ar: 'موقع' },
          administrative_division: { en: 'Division', ar: 'قسم' },
          coordinates: [37.1, 36.2]
        },
        description: { en: 'Old description', ar: 'وصف قديم' }
      };

      const updateData = {
        description: { en: 'New description', ar: 'وصف جديد' },
        casualties: 10
      };

      const updatedViolation = {
        ...existingViolation,
        ...updateData,
        updated_by: mockUserId
      };

      Violation.findById = jest.fn().mockResolvedValue(existingViolation);
      Violation.findByIdAndUpdate = jest.fn().mockResolvedValue(updatedViolation);

      const result = await updateViolation(mockViolationId, updateData, mockUserId);

      expect(result).toEqual(updatedViolation);
      expect(Violation.findById).toHaveBeenCalledWith(mockViolationId);
      expect(Violation.findByIdAndUpdate).toHaveBeenCalledWith(
        mockViolationId,
        {
          ...updateData,
          updated_by: mockUserId
        },
        {
          new: true,
          runValidators: true
        }
      );
      expect(geocodeLocationData).not.toHaveBeenCalled();
    });

    it('should update violation with location change and geocoding', async () => {
      const existingViolation = {
        _id: mockViolationId,
        type: 'AIRSTRIKE',
        location: {
          name: { en: 'Old Location', ar: 'موقع قديم' },
          administrative_division: { en: 'Old Division', ar: 'قسم قديم' },
          coordinates: [37.1, 36.2]
        }
      };

      const updateData = {
        location: {
          name: { en: 'New Location', ar: 'موقع جديد' },
          administrative_division: { en: 'New Division', ar: 'قسم جديد' }
        }
      };

      const newCoordinates = [38.5, 37.8];
      geocodeLocationData.mockResolvedValue(newCoordinates);

      const updatedViolation = {
        ...existingViolation,
        location: {
          ...updateData.location,
          coordinates: newCoordinates
        },
        updated_by: mockUserId
      };

      Violation.findById = jest.fn().mockResolvedValue(existingViolation);
      Violation.findByIdAndUpdate = jest.fn().mockResolvedValue(updatedViolation);

      const result = await updateViolation(mockViolationId, updateData, mockUserId);

      expect(result).toEqual(updatedViolation);
      expect(geocodeLocationData).toHaveBeenCalledWith(updateData.location);
      expect(Violation.findByIdAndUpdate).toHaveBeenCalledWith(
        mockViolationId,
        {
          location: {
            ...updateData.location,
            coordinates: newCoordinates
          },
          updated_by: mockUserId
        },
        {
          new: true,
          runValidators: true
        }
      );
    });

    it('should throw 404 error when violation not found', async () => {
      Violation.findById = jest.fn().mockResolvedValue(null);

      await expect(updateViolation(mockViolationId, {}, mockUserId))
        .rejects.toThrow(new ErrorResponse(`Violation not found with id of ${mockViolationId}`, 404));
    });

    it('should throw error when geocoding fails', async () => {
      const existingViolation = {
        _id: mockViolationId,
        location: {
          name: { en: 'Old Location', ar: 'موقع قديم' },
          administrative_division: { en: 'Old Division', ar: 'قسم قديم' }
        }
      };

      const updateData = {
        location: {
          name: { en: 'Invalid Location', ar: 'موقع غير صالح' }
        }
      };

      Violation.findById = jest.fn().mockResolvedValue(existingViolation);
      geocodeLocationData.mockRejectedValue(new Error('Geocoding failed'));

      await expect(updateViolation(mockViolationId, updateData, mockUserId))
        .rejects.toThrow(new ErrorResponse('Geocoding failed', 400));
    });

    it('should throw 404 error when update returns null', async () => {
      const existingViolation = {
        _id: mockViolationId,
        location: { name: { en: 'Location' } }
      };

      Violation.findById = jest.fn().mockResolvedValue(existingViolation);
      Violation.findByIdAndUpdate = jest.fn().mockResolvedValue(null);

      await expect(updateViolation(mockViolationId, { description: 'New' }, mockUserId))
        .rejects.toThrow(new ErrorResponse(`Violation not found with id of ${mockViolationId}`, 404));
    });
  });
});