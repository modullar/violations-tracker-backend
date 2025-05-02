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
      casualties: 5
    };

    const violation = new Violation(validViolation);
    const savedViolation = await violation.save();

    expect(savedViolation._id).toBeDefined();
    expect(savedViolation.type).toBe(validViolation.type);
    expect(savedViolation.description.en).toBe(validViolation.description.en);
    expect(savedViolation.location.coordinates).toEqual(validViolation.location.coordinates);
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
      expect(error.errors['perpetrator.en']).toBeDefined();
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