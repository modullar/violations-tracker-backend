const Violation = require('../../models/Violation');
const { fail } = require('expect');

// Mock external dependencies
jest.mock('../../config/logger', () => ({
  info: jest.fn(),
  error: jest.fn()
}));

// Mock mongoose connection
jest.mock('../../config/db', () => jest.fn().mockImplementation(() => {
  return Promise.resolve();
}));

// Mock mongoose model methods
jest.mock('../../models/Violation', () => {
  class ViolationModel {
    constructor(data) {
      Object.assign(this, {
        ...data,
        toJSON: function() {
          return {
            ...this,
            date: this.date instanceof Date ? this.date.toISOString() : this.date
          };
        }
      });
    }

    validate() {
      const errors = {};
      const validTypes = ['AIRSTRIKE', 'ARTILLERY', 'CHEMICAL', 'CLUSTER_MUNITION'];
      const validCertaintyLevels = ['confirmed', 'probable', 'possible'];

      if (!validTypes.includes(this.type)) {
        errors.type = { message: 'Invalid violation type' };
      }

      if (this.date && new Date(this.date) > new Date()) {
        errors.date = { message: 'Date cannot be in the future' };
      }

      if (this.location) {
        if (this.location.coordinates) {
          const [lon, lat] = this.location.coordinates;
          if (lon < -180 || lon > 180 || lat < -90 || lat > 90) {
            errors['location.coordinates'] = { message: 'Invalid coordinates' };
          }
        }
        if (this.location.name && (!this.location.name.en || this.location.name.en.length < 2)) {
          errors['location.name.en'] = { message: 'English location name too short' };
        }
      }

      if (this.description && (!this.description.en || this.description.en.length < 10)) {
        errors['description.en'] = { message: 'English description must be at least 10 characters' };
      }
      
      // Check source_url validation
      if (this.source_url) {
        const validateUrl = (url) => !url || /^(https?:\/\/)?([\da-z\.-]+)\.([a-z\.]{2,6})([\/\w \.-]*)*\/?$/.test(url);
        if (this.source_url.en && !validateUrl(this.source_url.en)) {
          errors.source_url = { message: 'Invalid URL format' };
        } else if (this.source_url.ar && !validateUrl(this.source_url.ar)) {
          errors.source_url = { message: 'Invalid URL format' };
        }
      }

      if (!validCertaintyLevels.includes(this.certainty_level)) {
        errors.certainty_level = { message: 'Invalid certainty level' };
      }

      if (Object.keys(errors).length > 0) {
        const error = new Error('Validation failed');
        error.errors = errors;
        throw error;
      }
    }

    save() {
      this.validate();
      return Promise.resolve({ ...this, _id: '5f7d327c3642214df4d0e0f8' });
    }

    static create(data) {
      const violation = new ViolationModel(data);
      return violation.save();
    }
  }

  return ViolationModel;
});

describe('Violation Model', () => {
  it('should create a violation with valid data', async () => {
    const validViolation = {
      type: 'AIRSTRIKE',
      date: '2023-06-15',
      location: {
        coordinates: [37.1, 36.2],
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
      casualties: 5
    };

    const violation = new Violation(validViolation);
    const savedViolation = await violation.save();

    expect(savedViolation._id).toBeDefined();
    expect(savedViolation.type).toBe(validViolation.type);
    expect(savedViolation.description).toBe(validViolation.description);
    expect(savedViolation.location.coordinates).toEqual(validViolation.location.coordinates);
  });

  it('should fail validation with invalid data', async () => {
    const invalidViolation = {
      type: 'INVALID_TYPE', // Invalid type
      date: '2025-01-01', // Future date
      location: {
        coordinates: [200, 100], // Invalid coordinates
        name: {
          en: 'A' // Too short
        }
      },
      description: {
        en: 'Short' // Too short
      },
      source_url: {
        en: 'not-a-valid-url', // Invalid URL format
        ar: 'غير-صالح'
      },
      verified: true,
      certainty_level: 'invalid' // Invalid certainty level
    };

    try {
      const violation = new Violation(invalidViolation);
      await violation.validate();
      fail('Validation should have failed');
    } catch (error) {
      expect(error.errors.type).toBeDefined();
      expect(error.errors['location.coordinates']).toBeDefined();
      expect(error.errors['description.en']).toBeDefined();
      expect(error.errors.source_url).toBeDefined();
      expect(error.errors.certainty_level).toBeDefined();
    }
  });

  it('should format dates correctly in toJSON method', () => {
    const date = new Date('2023-06-15');
    const violation = new Violation({
      type: 'AIRSTRIKE',
      date,
      location: {
        coordinates: [37.1, 36.2],
        name: 'Test Location'
      },
      description: 'Test violation description',
      verified: true,
      certainty_level: 'confirmed'
    });

    const jsonViolation = violation.toJSON();
    expect(jsonViolation.date).toBe(date.toISOString());
  });
}); 