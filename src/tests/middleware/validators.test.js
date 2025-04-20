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

    it('should validate violation type', () => {
      const typeRule = violationRules.find(rule => rule.field === 'type');
      expect(typeRule).toBeDefined();
    });

    it('should validate dates', () => {
      const dateRule = violationRules.find(rule => rule.field === 'date');
      const reportedDateRule = violationRules.find(rule => rule.field === 'reported_date');
      expect(dateRule).toBeDefined();
      expect(reportedDateRule).toBeDefined();
    });

    it('should validate location fields', () => {
      const locationRule = violationRules.find(rule => rule.field === 'location');
      const coordinatesRule = violationRules.find(rule => rule.field === 'location.coordinates');
      const nameRule = violationRules.find(rule => rule.field === 'location.name');
      const adminDivRule = violationRules.find(rule => rule.field === 'location.administrative_division');
      
      expect(locationRule).toBeDefined();
      expect(coordinatesRule).toBeDefined();
      expect(nameRule).toBeDefined();
      expect(adminDivRule).toBeDefined();
    });

    it('should validate description', () => {
      const descriptionRule = violationRules.find(rule => rule.field === 'description');
      expect(descriptionRule).toBeDefined();
    });

    it('should validate source information', () => {
      const sourceRule = violationRules.find(rule => rule.field === 'source');
      const sourceUrlRule = violationRules.find(rule => rule.field === 'source_url');
      expect(sourceRule).toBeDefined();
      expect(sourceUrlRule).toBeDefined();
    });

    it('should validate verification fields', () => {
      const verifiedRule = violationRules.find(rule => rule.field === 'verified');
      const certaintyRule = violationRules.find(rule => rule.field === 'certainty_level');
      const verificationMethodRule = violationRules.find(rule => rule.field === 'verification_method');
      
      expect(verifiedRule).toBeDefined();
      expect(certaintyRule).toBeDefined();
      expect(verificationMethodRule).toBeDefined();
    });

    it('should validate victim information', () => {
      const victimsRule = violationRules.find(rule => rule.field === 'victims');
      const casualtiesRule = violationRules.find(rule => rule.field === 'casualties');
      expect(victimsRule).toBeDefined();
      expect(casualtiesRule).toBeDefined();
    });

    it('should validate additional fields', () => {
      const perpetratorRule = violationRules.find(rule => rule.field === 'perpetrator');
      const affiliationRule = violationRules.find(rule => rule.field === 'perpetrator_affiliation');
      const mediaLinksRule = violationRules.find(rule => rule.field === 'media_links');
      const tagsRule = violationRules.find(rule => rule.field === 'tags');
      const relatedViolationsRule = violationRules.find(rule => rule.field === 'related_violations');
      
      expect(perpetratorRule).toBeDefined();
      expect(affiliationRule).toBeDefined();
      expect(mediaLinksRule).toBeDefined();
      expect(tagsRule).toBeDefined();
      expect(relatedViolationsRule).toBeDefined();
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
      expect(startDateRule).toBeDefined();
      expect(endDateRule).toBeDefined();
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