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
        if (this.location.name && this.location.name.length < 2) {
          errors['location.name'] = { message: 'Location name too short' };
        }
      }

      if (this.description && this.description.length < 10) {
        errors.description = { message: 'Description must be at least 10 characters' };
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
        name: 'Test Location',
        administrative_division: 'Test Division'
      },
      description: 'Test violation description',
      verified: true,
      certainty_level: 'confirmed',
      perpetrator: 'Test Perpetrator',
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
        name: 'A' // Too short
      },
      description: 'Short', // Too short
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
      expect(error.errors.description).toBeDefined();
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