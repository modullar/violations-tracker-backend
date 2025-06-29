const mongoose = require('mongoose');
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

describe('Violation Model', () => {
  beforeAll(async () => {
    await mongoose.connect('mongodb://localhost:27017/test_db', {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
  });

  afterAll(async () => {
    await mongoose.connection.close();
  });

  beforeEach(async () => {
    await Violation.deleteMany({});
  });

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
      verification_method: {
        en: 'Test verification method',
        ar: 'طريقة التحقق'
      },
      perpetrator: {
        en: 'Test Perpetrator',
        ar: 'مرتكب الاختبار'
      },
      perpetrator_affiliation: 'assad_regime',
      casualties: 5,
      kidnapped_count: 2,
      detained_count: 3,
      injured_count: 10,
      displaced_count: 20
    };

    const violation = new Violation(validViolation);
    const savedViolation = await violation.save();

    expect(savedViolation._id).toBeDefined();
    expect(savedViolation.type).toBe(validViolation.type);
    expect(savedViolation.description.en).toBe(validViolation.description.en);
    expect(savedViolation.location.coordinates).toEqual(validViolation.location.coordinates);
    expect(savedViolation.detained_count).toBe(validViolation.detained_count);
  });

  it('should create a violation with international_coalition perpetrator', async () => {
    const violationWithInternationalCoalition = {
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
        en: 'International Coalition',
        ar: 'التحالف الدولي'
      },
      perpetrator_affiliation: 'international_coalition',
      casualties: 3
    };

    const violation = new Violation(violationWithInternationalCoalition);
    const savedViolation = await violation.save();

    expect(savedViolation._id).toBeDefined();
    expect(savedViolation.type).toBe(violationWithInternationalCoalition.type);
    expect(savedViolation.perpetrator_affiliation).toBe('international_coalition');
    expect(savedViolation.description.en).toBe(violationWithInternationalCoalition.description.en);
  });

  it('should create a violation with landmine type', async () => {
    const landmineViolation = {
      type: 'LANDMINE',
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
        en: 'Test landmine violation description',
        ar: 'وصف انتهاك لغم أرضي'
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
        en: 'Test verification method',
        ar: 'طريقة التحقق'
      },
      perpetrator: {
        en: 'Test Perpetrator',
        ar: 'مرتكب الاختبار'
      },
      perpetrator_affiliation: 'assad_regime',
      casualties: 2,
      injured_count: 3
    };

    const violation = new Violation(landmineViolation);
    const savedViolation = await violation.save();

    expect(savedViolation._id).toBeDefined();
    expect(savedViolation.type).toBe('LANDMINE');
    expect(savedViolation.description.en).toBe(landmineViolation.description.en);
    expect(savedViolation.location.coordinates).toEqual(landmineViolation.location.coordinates);
  });

  it('should fail validation with invalid data', async () => {
    const invalidViolation = {
      type: 'INVALID_TYPE',
      date: '2025-01-01',
      location: {
        coordinates: [200, 100],
        name: {
          en: 'A',
          ar: 'ا'
        }
      },
      description: {
        en: 'Short',
        ar: 'قصير'
      },
      source_url: {
        en: 'not-a-valid-url'
      },
      verified: true,
      certainty_level: 'invalid',
      perpetrator_affiliation: 'invalid_affiliation'
    };

    try {
      const violation = new Violation(invalidViolation);
      await violation.validate();
      fail('Validation should have failed');
    } catch (error) {
      // Check for required field errors
      expect(error.errors['perpetrator_affiliation']).toBeDefined();
      expect(error.errors['source.en']).toBeDefined();
      expect(error.errors['location.administrative_division.en']).toBeDefined();
      
      // Check for invalid value errors
      expect(error.errors.type).toBeDefined();
      expect(error.errors['location.coordinates']).toBeDefined();
      expect(error.errors.certainty_level).toBeDefined();
      expect(error.errors['location.name']).toBeDefined();
      expect(error.errors.description).toBeDefined();
    }
  });

  it('should format dates correctly in toJSON method', () => {
    const date = new Date('2023-06-15');
    const violation = new Violation({
      type: 'AIRSTRIKE',
      date,
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
        en: 'Test description',
        ar: 'وصف الاختبار'
      },
      source: {
        en: 'Test Source',
        ar: 'مصدر الاختبار'
      },
      source_url: {
        en: 'https://example.com',
        ar: 'https://example.com/ar'
      },
      verified: true,
      certainty_level: 'confirmed',
      verification_method: {
        en: 'Test verification',
        ar: 'التحقق'
      },
      perpetrator: {
        en: 'Test Perpetrator',
        ar: 'مرتكب الاختبار'
      },
      kidnapped_count: 3,
      detained_count: 2,
      injured_count: 7,
      displaced_count: 25,
      perpetrator_affiliation: 'assad_regime'
    });

    const jsonViolation = violation.toJSON();
    expect(jsonViolation.date).toBe('2023-06-15');
  });
});

describe('Victim Information Validation', () => {
  it('should allow creating a violation without sectarian identity', async () => {
    const violationData = {
      type: 'AIRSTRIKE',
      date: '2023-01-01',
      location: {
        coordinates: [37.1, 36.2],
        name: { en: 'Test Location', ar: 'موقع الاختبار' },
        administrative_division: { en: 'Test Division', ar: 'قسم الاختبار' }
      },
      description: { en: 'Test description', ar: 'وصف الاختبار' },
      source: { en: 'Test Source', ar: 'مصدر الاختبار' },
      source_url: { en: 'https://example.com', ar: 'https://example.com/ar' },
      verified: true,
      certainty_level: 'confirmed',
      verification_method: { en: 'Test verification', ar: 'التحقق' },
      perpetrator: { en: 'Test Perpetrator', ar: 'مرتكب الاختبار' },
      perpetrator_affiliation: 'assad_regime',
      victims: [{
        gender: 'male',
        status: 'civilian',
        group_affiliation: { en: 'None', ar: 'لا يوجد' }
      }]
    };

    const violation = new Violation(violationData);
    await expect(violation.validate()).resolves.not.toThrow();
  });

  it('should allow creating a violation with sectarian identity without English text', async () => {
    const violationData = {
      type: 'AIRSTRIKE',
      date: '2023-01-01',
      location: {
        coordinates: [37.1, 36.2],
        name: { en: 'Test Location', ar: 'موقع الاختبار' },
        administrative_division: { en: 'Test Division', ar: 'قسم الاختبار' }
      },
      description: { en: 'Test description', ar: 'وصف الاختبار' },
      source: { en: 'Test Source', ar: 'مصدر الاختبار' },
      source_url: { en: 'https://example.com', ar: 'https://example.com/ar' },
      verified: true,
      certainty_level: 'confirmed',
      verification_method: { en: 'Test verification', ar: 'التحقق' },
      perpetrator: { en: 'Test Perpetrator', ar: 'مرتكب الاختبار' },
      perpetrator_affiliation: 'assad_regime',
      victims: [{
        gender: 'male',
        status: 'civilian',
        group_affiliation: { en: 'None', ar: 'لا يوجد' },
        sectarian_identity: { ar: 'هوية طائفية' }
      }]
    };

    const violation = new Violation(violationData);
    await expect(violation.validate()).resolves.not.toThrow();
  });

  it('should allow creating a violation with sectarian identity and both languages', async () => {
    const violationData = {
      type: 'AIRSTRIKE',
      date: '2023-01-01',
      location: {
        coordinates: [37.1, 36.2],
        name: { en: 'Test Location', ar: 'موقع الاختبار' },
        administrative_division: { en: 'Test Division', ar: 'قسم الاختبار' }
      },
      description: { en: 'Test description', ar: 'وصف الاختبار' },
      source: { en: 'Test Source', ar: 'مصدر الاختبار' },
      source_url: { en: 'https://example.com', ar: 'https://example.com/ar' },
      verified: true,
      certainty_level: 'confirmed',
      verification_method: { en: 'Test verification', ar: 'التحقق' },
      perpetrator: { en: 'Test Perpetrator', ar: 'مرتكب الاختبار' },
      perpetrator_affiliation: 'assad_regime',
      victims: [{
        gender: 'male',
        status: 'civilian',
        group_affiliation: { en: 'None', ar: 'لا يوجد' },
        sectarian_identity: { en: 'Sectarian Identity', ar: 'هوية طائفية' }
      }]
    };

    const violation = new Violation(violationData);
    await expect(violation.validate()).resolves.not.toThrow();
  });

  it('should allow creating a violation without group affiliation', async () => {
    const violationData = {
      type: 'AIRSTRIKE',
      date: '2023-01-01',
      location: {
        coordinates: [37.1, 36.2],
        name: { en: 'Test Location', ar: 'موقع الاختبار' },
        administrative_division: { en: 'Test Division', ar: 'قسم الاختبار' }
      },
      description: { en: 'Test description', ar: 'وصف الاختبار' },
      source: { en: 'Test Source', ar: 'مصدر الاختبار' },
      source_url: { en: 'https://example.com', ar: 'https://example.com/ar' },
      verified: true,
      certainty_level: 'confirmed',
      verification_method: { en: 'Test verification', ar: 'التحقق' },
      perpetrator: { en: 'Test Perpetrator', ar: 'مرتكب الاختبار' },
      perpetrator_affiliation: 'assad_regime',
      victims: [{
        gender: 'male',
        status: 'civilian'
      }]
    };

    const violation = new Violation(violationData);
    await expect(violation.validate()).resolves.not.toThrow();
  });
});

describe('Verification Method Validation', () => {
  it('should allow creating a violation without verification method', async () => {
    const violationData = {
      type: 'AIRSTRIKE',
      date: '2023-01-01',
      location: {
        coordinates: [37.1, 36.2],
        name: { en: 'Test Location', ar: 'موقع الاختبار' },
        administrative_division: { en: 'Test Division', ar: 'قسم الاختبار' }
      },
      description: { en: 'Test description', ar: 'وصف الاختبار' },
      source: { en: 'Test Source', ar: 'مصدر الاختبار' },
      source_url: { en: 'https://example.com', ar: 'https://example.com/ar' },
      verified: true,
      certainty_level: 'confirmed',
      perpetrator: { en: 'Test Perpetrator', ar: 'مرتكب الاختبار' },
      perpetrator_affiliation: 'assad_regime'
    };

    const violation = new Violation(violationData);
    await expect(violation.validate()).resolves.not.toThrow();
  });

  it('should allow creating a violation with verification method without English text', async () => {
    const violationData = {
      type: 'AIRSTRIKE',
      date: '2023-01-01',
      location: {
        coordinates: [37.1, 36.2],
        name: { en: 'Test Location', ar: 'موقع الاختبار' },
        administrative_division: { en: 'Test Division', ar: 'قسم الاختبار' }
      },
      description: { en: 'Test description', ar: 'وصف الاختبار' },
      source: { en: 'Test Source', ar: 'مصدر الاختبار' },
      source_url: { en: 'https://example.com', ar: 'https://example.com/ar' },
      verified: true,
      certainty_level: 'confirmed',
      verification_method: { ar: 'طريقة التحقق' },
      perpetrator: { en: 'Test Perpetrator', ar: 'مرتكب الاختبار' },
      perpetrator_affiliation: 'assad_regime'
    };

    const violation = new Violation(violationData);
    await expect(violation.validate()).resolves.not.toThrow();
  });

  it('should allow creating a violation with verification method in both languages', async () => {
    const violationData = {
      type: 'AIRSTRIKE',
      date: '2023-01-01',
      location: {
        coordinates: [37.1, 36.2],
        name: { en: 'Test Location', ar: 'موقع الاختبار' },
        administrative_division: { en: 'Test Division', ar: 'قسم الاختبار' }
      },
      description: { en: 'Test description', ar: 'وصف الاختبار' },
      source: { en: 'Test Source', ar: 'مصدر الاختبار' },
      source_url: { en: 'https://example.com', ar: 'https://example.com/ar' },
      verified: true,
      certainty_level: 'confirmed',
      verification_method: { en: 'Test verification method', ar: 'طريقة التحقق' },
      perpetrator: { en: 'Test Perpetrator', ar: 'مرتكب الاختبار' },
      perpetrator_affiliation: 'assad_regime'
    };

    const violation = new Violation(violationData);
    await expect(violation.validate()).resolves.not.toThrow();
  });
});

describe('Reported Date Validation', () => {
  it('should accept a reported date within 24 hours in the future', async () => {
    const now = new Date();
    // Create a date 6 hours in the future to be well within the 24-hour buffer
    // even after the schema sets it to end of day
    const futureDate = new Date(now.getTime() + 6 * 60 * 60 * 1000);
    
    const violationData = {
      type: 'AIRSTRIKE',
      date: '2023-01-01',
      reported_date: futureDate,
      location: {
        coordinates: [37.1, 36.2],
        name: { en: 'Test Location', ar: 'موقع الاختبار' },
        administrative_division: { en: 'Test Division', ar: 'قسم الاختبار' }
      },
      description: { en: 'Test description', ar: 'وصف الاختبار' },
      source: { en: 'Test Source', ar: 'مصدر الاختبار' },
      source_url: { en: 'https://example.com', ar: 'https://example.com/ar' },
      verified: true,
      certainty_level: 'confirmed',
      verification_method: { en: 'Test verification', ar: 'التحقق' },
      perpetrator: { en: 'Test Perpetrator', ar: 'مرتكب الاختبار' },
      perpetrator_affiliation: 'assad_regime'
    };

    const violation = new Violation(violationData);
    await expect(violation.validate()).resolves.not.toThrow();
  });

  it('should reject a reported date more than 24 hours in the future', async () => {
    const now = new Date();
    // Create a date 30 hours in the future to be clearly outside the buffer
    const futureDate = new Date(now.getTime() + 30 * 60 * 60 * 1000);
    
    const violationData = {
      type: 'AIRSTRIKE',
      date: '2023-01-01',
      reported_date: futureDate,
      location: {
        coordinates: [37.1, 36.2],
        name: { en: 'Test Location', ar: 'موقع الاختبار' },
        administrative_division: { en: 'Test Division', ar: 'قسم الاختبار' }
      },
      description: { en: 'Test description', ar: 'وصف الاختبار' },
      source: { en: 'Test Source', ar: 'مصدر الاختبار' },
      source_url: { en: 'https://example.com', ar: 'https://example.com/ar' },
      verified: true,
      certainty_level: 'confirmed',
      verification_method: { en: 'Test verification', ar: 'التحقق' },
      perpetrator: { en: 'Test Perpetrator', ar: 'مرتكب الاختبار' },
      perpetrator_affiliation: 'assad_regime'
    };

    const violation = new Violation(violationData);
    await expect(violation.validate()).rejects.toThrow('Reported date cannot be more than 24 hours in the future');
  });

  it('should accept a reported date in the past', async () => {
    const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours in the past
    const violationData = {
      type: 'AIRSTRIKE',
      date: '2023-01-01',
      reported_date: pastDate,
      location: {
        coordinates: [37.1, 36.2],
        name: { en: 'Test Location', ar: 'موقع الاختبار' },
        administrative_division: { en: 'Test Division', ar: 'قسم الاختبار' }
      },
      description: { en: 'Test description', ar: 'وصف الاختبار' },
      source: { en: 'Test Source', ar: 'مصدر الاختبار' },
      source_url: { en: 'https://example.com', ar: 'https://example.com/ar' },
      verified: true,
      certainty_level: 'confirmed',
      verification_method: { en: 'Test verification', ar: 'التحقق' },
      perpetrator: { en: 'Test Perpetrator', ar: 'مرتكب الاختبار' },
      perpetrator_affiliation: 'assad_regime'
    };

    const violation = new Violation(violationData);
    await expect(violation.validate()).resolves.not.toThrow();
  });
});

describe('Static validation methods', () => {
  describe('sanitizeData', () => {
    it('should sanitize and normalize violation data', () => {
      const rawData = {
        type: 'AIRSTRIKE',
        date: '2023-06-15',
        reported_date: '2023-06-16',
        location: {
          name: 'Test Location',
          administrative_division: 'Test Division'
        },
        description: 'Test description',
        casualties: '5',
        victims: [{
          death_date: '2023-06-15'
        }]
      };

      const sanitized = Violation.sanitizeData(rawData);

      expect(sanitized.date).toBeInstanceOf(Date);
      expect(sanitized.reported_date).toBeInstanceOf(Date);
      expect(sanitized.casualties).toBe(5);
      expect(sanitized.verified).toBe(false);
      expect(sanitized.perpetrator_affiliation).toBe('unknown');
      expect(sanitized.certainty_level).toBe('possible');
      expect(sanitized.location.name).toEqual({ en: 'Test Location', ar: '' });
      expect(sanitized.location.administrative_division).toEqual({ en: 'Test Division', ar: '' });
      expect(sanitized.description).toEqual({ en: 'Test description', ar: '' });
      expect(sanitized.victims[0].death_date).toBeInstanceOf(Date);
    });
  });

  describe('validateForCreation', () => {
    it('should validate violation with business rules', async () => {
      const validData = {
        type: 'AIRSTRIKE',
        date: '2023-06-15',
        location: {
          name: { en: 'Test Location', ar: '' },
          administrative_division: { en: 'Test Division', ar: '' }
        },
        description: { en: 'Test violation description that is long enough', ar: '' },
        verified: false,
        certainty_level: 'confirmed',
        perpetrator_affiliation: 'assad_regime'
      };

      const result = await Violation.validateForCreation(validData);
      expect(result).toBeDefined();
      expect(result.type).toBe('AIRSTRIKE');
    });

    it('should fail validation for detention without detained_count', async () => {
      const invalidData = {
        type: 'DETENTION',
        date: '2023-06-15',
        location: {
          name: { en: 'Test Location', ar: '' }
        },
        description: { en: 'Test detention without count', ar: '' },
        verified: false,
        certainty_level: 'confirmed'
      };

      try {
        await Violation.validateForCreation(invalidData);
        fail('Should have failed validation');
      } catch (error) {
        expect(error.name).toBe('ValidationError');
        expect(error.errors.detained_count).toBeDefined();
        expect(error.errors.detained_count.message).toContain('Detained count is required');
      }
    });

    it('should fail validation for verified violation without verification method', async () => {
      const invalidData = {
        type: 'AIRSTRIKE',
        date: '2023-06-15',
        location: {
          name: { en: 'Test Location', ar: '' }
        },
        description: { en: 'Test verified violation without method', ar: '' },
        verified: true,
        certainty_level: 'confirmed'
      };

      try {
        await Violation.validateForCreation(invalidData);
        fail('Should have failed validation');
      } catch (error) {
        expect(error.name).toBe('ValidationError');
        expect(error.errors['verification_method.en']).toBeDefined();
      }
    });

    it('should fail validation for victim death date before incident date', async () => {
      const invalidData = {
        type: 'MURDER',
        date: '2023-06-15',
        location: {
          name: { en: 'Test Location', ar: '' }
        },
        description: { en: 'Test murder with invalid death date', ar: '' },
        verified: false,
        certainty_level: 'confirmed',
        victims: [{
          death_date: '2023-06-10' // Before incident date
        }]
      };

      try {
        await Violation.validateForCreation(invalidData);
        fail('Should have failed validation');
      } catch (error) {
        expect(error.name).toBe('ValidationError');
        expect(error.errors['victims[0].death_date']).toBeDefined();
      }
    });
  });

  describe('validateBatch', () => {
    it('should validate batch of violations', async () => {
      const violationsData = [
        {
          type: 'AIRSTRIKE',
          date: '2023-06-15',
          location: {
            name: { en: 'Valid Location', ar: '' }
          },
          description: { en: 'Valid description that is long enough', ar: '' },
          verified: false,
          certainty_level: 'confirmed'
        },
        {
          type: 'DETENTION',
          date: '2023-06-16',
          location: {
            name: { en: 'Another Location', ar: '' }
          },
          description: { en: 'Invalid detention without count', ar: '' },
          verified: false,
          certainty_level: 'confirmed'
          // Missing detained_count for DETENTION type
        }
      ];

      const result = await Violation.validateBatch(violationsData);

      expect(result.valid).toHaveLength(1);
      expect(result.invalid).toHaveLength(1);
      expect(result.valid[0].type).toBe('AIRSTRIKE');
      expect(result.invalid[0].index).toBe(1);
      expect(result.invalid[0].errors).toContain('Detained count is required for detention violations');
    });
  });
});

describe('Date formatting in JSON', () => {
  it('should format dates correctly in toJSON method', () => {
    const date = new Date('2023-06-15');
    const violation = new Violation({
      type: 'AIRSTRIKE',
      date,
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
        en: 'Test description',
        ar: 'وصف الاختبار'
      },
      source: {
        en: 'Test Source',
        ar: 'مصدر الاختبار'
      },
      source_url: {
        en: 'https://example.com',
        ar: 'https://example.com/ar'
      },
      verified: true,
      certainty_level: 'confirmed',
      verification_method: {
        en: 'Test verification',
        ar: 'التحقق'
      },
      perpetrator: {
        en: 'Test Perpetrator',
        ar: 'مرتكب الاختبار'
      },
      kidnapped_count: 3,
      detained_count: 2,
      injured_count: 7,
      displaced_count: 25,
      perpetrator_affiliation: 'assad_regime'
    });

    const jsonViolation = violation.toJSON();
    expect(jsonViolation.date).toBe('2023-06-15');
  });
}); 