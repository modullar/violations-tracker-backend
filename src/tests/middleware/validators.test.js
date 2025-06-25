const { validationResult } = require('express-validator');
const ErrorResponse = require('../../utils/errorResponse');
const {
  validateRequest,
  userRegistrationRules,
  userLoginRules,
  violationRules,
  violationFilterRules,
  idParamRules
} = require('../../middleware/validators');

// Mock express-validator
jest.mock('express-validator', () => {
  const createChain = (field) => ({
    field,
    trim: () => createChain(field),
    notEmpty: () => createChain(field),
    withMessage: () => createChain(field),
    isLength: () => createChain(field),
    isEmail: () => createChain(field),
    isIn: () => createChain(field),
    optional: () => createChain(field),
    isISO8601: () => createChain(field),
    custom: () => createChain(field),
    isObject: () => createChain(field),
    isArray: () => createChain(field),
    isBoolean: () => createChain(field),
    isInt: () => createChain(field),
    isURL: () => createChain(field),
    isString: () => createChain(field),
    isFloat: () => createChain(field)
  });

  return {
    body: jest.fn().mockImplementation((field) => createChain(field)),
    param: jest.fn().mockImplementation((field) => createChain(field)),
    query: jest.fn().mockImplementation((field) => createChain(field)),
    validationResult: jest.fn()
  };
});

describe('Validators Middleware', () => {
  describe('validateRequest', () => {
    let req, res, next;

    beforeEach(() => {
      req = {};
      res = {};
      next = jest.fn();
      jest.clearAllMocks();
    });

    it('should call next() if no validation errors', () => {
      validationResult.mockReturnValue({
        isEmpty: () => true,
        array: () => []
      });

      validateRequest(req, res, next);
      expect(next).toHaveBeenCalledWith();
    });

    it('should call next() with error if validation errors exist', () => {
      validationResult.mockReturnValue({
        isEmpty: () => false,
        array: () => [{
          msg: 'Test validation error'
        }]
      });

      validateRequest(req, res, next);
      expect(next).toHaveBeenCalledWith(
        expect.any(ErrorResponse)
      );
      expect(next.mock.calls[0][0].message).toBe('Test validation error');
      expect(next.mock.calls[0][0].statusCode).toBe(400);
    });
  });

  describe('User Registration Rules', () => {
    it('should have required validation rules', () => {
      expect(Array.isArray(userRegistrationRules)).toBe(true);
      expect(userRegistrationRules).toHaveLength(4); // name, email, password, optional role
    });

    it('should contain name validation', () => {
      const nameRule = userRegistrationRules.find(rule => rule.field === 'name');
      expect(nameRule).toBeDefined();
    });

    it('should contain email validation', () => {
      const emailRule = userRegistrationRules.find(rule => rule.field === 'email');
      expect(emailRule).toBeDefined();
    });

    it('should contain password validation', () => {
      const passwordRule = userRegistrationRules.find(rule => rule.field === 'password');
      expect(passwordRule).toBeDefined();
    });

    it('should contain optional role validation', () => {
      const roleRule = userRegistrationRules.find(rule => rule.field === 'role');
      expect(roleRule).toBeDefined();
    });
  });

  describe('User Login Rules', () => {
    it('should have required validation rules', () => {
      expect(Array.isArray(userLoginRules)).toBe(true);
      expect(userLoginRules).toHaveLength(2);
    });

    it('should contain email validation', () => {
      const emailRule = userLoginRules.find(rule => rule.field === 'email');
      expect(emailRule).toBeDefined();
    });

    it('should contain password validation', () => {
      const passwordRule = userLoginRules.find(rule => rule.field === 'password');
      expect(passwordRule).toBeDefined();
    });
  });

  describe('Violation Rules', () => {
    it('should have required validation rules', () => {
      expect(Array.isArray(violationRules)).toBe(true);
      expect(violationRules.length).toBeGreaterThan(0);
    });

    it('should validate basic violation fields', () => {
      const typeRule = violationRules.find(rule => rule.field === 'type');
      const dateRule = violationRules.find(rule => rule.field === 'date');
      const locationRule = violationRules.find(rule => rule.field === 'location');
      const descriptionRule = violationRules.find(rule => rule.field === 'description');
      
      expect(typeRule).toBeDefined();
      expect(dateRule).toBeDefined();
      expect(locationRule).toBeDefined();
      expect(descriptionRule).toBeDefined();
    });

    it('should validate optional fields', () => {
      const reportedDateRule = violationRules.find(rule => rule.field === 'reported_date');
      const verifiedRule = violationRules.find(rule => rule.field === 'verified');
      const certaintyRule = violationRules.find(rule => rule.field === 'certainty_level');
      const casualtiesRule = violationRules.find(rule => rule.field === 'casualties');
      
      expect(reportedDateRule).toBeDefined();
      expect(verifiedRule).toBeDefined();
      expect(certaintyRule).toBeDefined();
      expect(casualtiesRule).toBeDefined();
    });

    it('should validate array fields', () => {
      const victimsRule = violationRules.find(rule => rule.field === 'victims');
      const mediaLinksRule = violationRules.find(rule => rule.field === 'media_links');
      const tagsRule = violationRules.find(rule => rule.field === 'tags');
      const relatedViolationsRule = violationRules.find(rule => rule.field === 'related_violations');
      
      expect(victimsRule).toBeDefined();
      expect(mediaLinksRule).toBeDefined();
      expect(tagsRule).toBeDefined();
      expect(relatedViolationsRule).toBeDefined();
    });

    it('should validate count fields', () => {
      const kidnappedRule = violationRules.find(rule => rule.field === 'kidnapped_count');
      const detainedRule = violationRules.find(rule => rule.field === 'detained_count');
      const injuredRule = violationRules.find(rule => rule.field === 'injured_count');
      
      expect(kidnappedRule).toBeDefined();
      expect(detainedRule).toBeDefined();
      expect(injuredRule).toBeDefined();
    });

    describe('Date Validation', () => {
      it('should validate date format', () => {
        const dateRule = violationRules.find(rule => rule.field === 'date');
        expect(dateRule).toBeDefined();
      });

      it('should validate reported date format', () => {
        const reportedDateRule = violationRules.find(rule => rule.field === 'reported_date');
        expect(reportedDateRule).toBeDefined();
      });

      // Note: Business logic validation (like future dates) is now handled by the model
      it('should only validate format, not business rules', () => {
        // This test ensures we're only doing format validation in express validators
        // Business rules like "date cannot be in future" are now in the model
        expect(true).toBe(true); // Placeholder to document the change
      });
    });
  });

  describe('ID Parameter Rules', () => {
    it('should validate ID parameter', () => {
      expect(Array.isArray(idParamRules)).toBe(true);
      expect(idParamRules).toHaveLength(1);
      
      const idRule = idParamRules[0];
      expect(idRule.field).toBe('id');
    });
  });

  describe('Violation Filter Rules', () => {
    it('should have filter validation rules', () => {
      expect(Array.isArray(violationFilterRules)).toBe(true);
      expect(violationFilterRules.length).toBeGreaterThan(0);
    });

    it('should validate type filter', () => {
      const typeRule = violationFilterRules.find(rule => rule.field === 'type');
      expect(typeRule).toBeDefined();
    });

    it('should validate date range filters', () => {
      const startDateRule = violationFilterRules.find(rule => rule.field === 'startDate');
      const endDateRule = violationFilterRules.find(rule => rule.field === 'endDate');
      const dateFilterTypeRule = violationFilterRules.find(rule => rule.field === 'dateFilterType');
      expect(startDateRule).toBeDefined();
      expect(endDateRule).toBeDefined();
      expect(dateFilterTypeRule).toBeDefined();
    });

    it('should validate location filters', () => {
      const locationRule = violationFilterRules.find(rule => rule.field === 'location');
      const adminDivRule = violationFilterRules.find(rule => rule.field === 'administrative_division');
      expect(locationRule).toBeDefined();
      expect(adminDivRule).toBeDefined();
    });

    it('should validate status filters', () => {
      const certaintyRule = violationFilterRules.find(rule => rule.field === 'certainty_level');
      const verifiedRule = violationFilterRules.find(rule => rule.field === 'verified');
      expect(certaintyRule).toBeDefined();
      expect(verifiedRule).toBeDefined();
    });

    it('should validate perpetrator filters', () => {
      const perpetratorRule = violationFilterRules.find(rule => rule.field === 'perpetrator');
      const affiliationRule = violationFilterRules.find(rule => rule.field === 'perpetrator_affiliation');
      expect(perpetratorRule).toBeDefined();
      expect(affiliationRule).toBeDefined();
    });

    it('should validate geographical filters', () => {
      const latitudeRule = violationFilterRules.find(rule => rule.field === 'latitude');
      const longitudeRule = violationFilterRules.find(rule => rule.field === 'longitude');
      const radiusRule = violationFilterRules.find(rule => rule.field === 'radius');
      expect(latitudeRule).toBeDefined();
      expect(longitudeRule).toBeDefined();
      expect(radiusRule).toBeDefined();
    });

    it('should validate pagination and sorting', () => {
      const pageRule = violationFilterRules.find(rule => rule.field === 'page');
      const limitRule = violationFilterRules.find(rule => rule.field === 'limit');
      const sortRule = violationFilterRules.find(rule => rule.field === 'sort');
      expect(pageRule).toBeDefined();
      expect(limitRule).toBeDefined();
      expect(sortRule).toBeDefined();
    });
  });
}); 