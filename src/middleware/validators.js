const { body, param, query, validationResult } = require('express-validator');
const ErrorResponse = require('../utils/errorResponse');

// Validate request based on schema
const validateRequest = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return next(new ErrorResponse(errors.array()[0].msg, 400));
  }
  next();
};

// User registration validation rules
const userRegistrationRules = [
  body('name')
    .trim()
    .notEmpty()
    .withMessage('Name is required')
    .isLength({ max: 50 })
    .withMessage('Name cannot be more than 50 characters'),
  body('email')
    .trim()
    .notEmpty()
    .withMessage('Email is required')
    .isEmail()
    .withMessage('Please provide a valid email'),
  body('password')
    .notEmpty()
    .withMessage('Password is required')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters'),
  body('role')
    .optional()
    .isIn(['user', 'editor', 'admin'])
    .withMessage('Role must be either user, editor, or admin')
];

// User login validation rules
const userLoginRules = [
  body('email')
    .trim()
    .notEmpty()
    .withMessage('Email is required')
    .isEmail()
    .withMessage('Please provide a valid email'),
  body('password')
    .notEmpty()
    .withMessage('Password is required')
];

// Violation creation/update validation rules - simplified to basic input validation only
const violationRules = [
  body('type')
    .notEmpty()
    .withMessage('Violation type is required'),
  
  body('date')
    .notEmpty()
    .withMessage('Incident date is required')
    .isISO8601()
    .withMessage('Date must be a valid ISO date (YYYY-MM-DD)'),
  
  body('reported_date')
    .optional()
    .isISO8601()
    .withMessage('Reported date must be a valid ISO date (YYYY-MM-DD)'),
  
  body('location')
    .notEmpty()
    .withMessage('Location is required')
    .isObject()
    .withMessage('Location must be an object'),
  
  body('description')
    .notEmpty()
    .withMessage('Description is required'),
  
  body('verified')
    .optional()
    .isBoolean()
    .withMessage('Verified must be a boolean value'),
  
  body('certainty_level')
    .optional()
    .isIn(['confirmed', 'probable', 'possible'])
    .withMessage('Certainty level must be one of: confirmed, probable, possible'),
  
  body('casualties')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Casualties must be a non-negative integer'),
  
  body('victims')
    .optional()
    .isArray()
    .withMessage('Victims must be an array'),
  
  body('media_links')
    .optional()
    .isArray()
    .withMessage('Media links must be an array'),
  
  body('tags')
    .optional()
    .isArray()
    .withMessage('Tags must be an array'),
  
  body('related_violations')
    .optional()
    .isArray()
    .withMessage('Related violations must be an array'),
  
  body('kidnapped_count')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Kidnapped count must be a non-negative integer'),
  
  body('detained_count')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Detained count must be a non-negative integer'),
  
  body('injured_count')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Injured count must be a non-negative integer'),
];

// Batch violations validation - simplified
const batchViolationsRules = [
  body()
    .isArray()
    .withMessage('Request body must be an array of violations')
    .notEmpty()
    .withMessage('At least one violation must be provided'),
  body('*.type')
    .notEmpty()
    .withMessage('Violation type is required'),
  body('*.date')
    .notEmpty()
    .withMessage('Incident date is required')
    .isISO8601()
    .withMessage('Date must be a valid ISO date (YYYY-MM-DD)'),
  body('*.reported_date')
    .optional()
    .isISO8601()
    .withMessage('Reported date must be a valid ISO date (YYYY-MM-DD)'),
  body('*.location')
    .notEmpty()
    .withMessage('Location is required')
    .isObject()
    .withMessage('Location must be an object'),
  body('*.description')
    .notEmpty()
    .withMessage('Description is required'),
  body('*.verified')
    .optional()
    .isBoolean()
    .withMessage('Verified must be a boolean value'),
  body('*.certainty_level')
    .optional()
    .isIn(['confirmed', 'probable', 'possible'])
    .withMessage('Certainty level must be one of: confirmed, probable, possible'),
  body('*.casualties')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Casualties must be a non-negative integer'),
  body('*.victims')
    .optional()
    .isArray()
    .withMessage('Victims must be an array'),
  body('*.media_links')
    .optional()
    .isArray()
    .withMessage('Media links must be an array'),
  body('*.tags')
    .optional()
    .isArray()
    .withMessage('Tags must be an array'),
  body('*.related_violations')
    .optional()
    .isArray()
    .withMessage('Related violations must be an array'),
  body('*.kidnapped_count')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Kidnapped count must be a non-negative integer'),
  body('*.detained_count')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Detained count must be a non-negative integer'),
  body('*.injured_count')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Injured count must be a non-negative integer'),
];

// Validation for ID parameter
const idParamRules = [
  param('id')
    .notEmpty()
    .withMessage('ID is required')
];

// Violation filtering validation rules
const violationFilterRules = [
  query('type')
    .optional()
    .isIn([
      'AIRSTRIKE', 'CHEMICAL_ATTACK', 'DETENTION', 'DISPLACEMENT', 
      'EXECUTION', 'SHELLING', 'SIEGE', 'TORTURE', 'MURDER', 
      'SHOOTING', 'HOME_INVASION', 'EXPLOSION', 'AMBUSH', 'LANDMINE', 'OTHER'
    ])
    .withMessage('Invalid violation type'),
  
  query('startDate')
    .optional()
    .isISO8601()
    .withMessage('Start date must be a valid ISO date (YYYY-MM-DD)'),
  
  query('endDate')
    .optional()
    .isISO8601()
    .withMessage('End date must be a valid ISO date (YYYY-MM-DD)'),
  
  query('dateFilterType')
    .optional()
    .isIn(['date', 'reported_date'])
    .withMessage('Date filter type must be either "date" or "reported_date"'),
  
  query('location')
    .optional()
    .isString()
    .withMessage('Location must be a string'),
  
  query('administrative_division')
    .optional()
    .isString()
    .withMessage('Administrative division must be a string'),
  
  query('certainty_level')
    .optional()
    .isIn(['confirmed', 'probable', 'possible'])
    .withMessage('Certainty level must be one of: confirmed, probable, possible'),
  
  query('verified')
    .optional()
    .isBoolean()
    .withMessage('Verified must be a boolean value'),
  
  query('perpetrator')
    .optional()
    .isString()
    .withMessage('Perpetrator must be a string'),
  
  query('perpetrator_affiliation')
    .optional()
    .isString()
    .withMessage('Perpetrator affiliation must be a string'),
  
  query('latitude')
    .optional()
    .isFloat({ min: -90, max: 90 })
    .withMessage('Latitude must be between -90 and 90'),
  
  query('longitude')
    .optional()
    .isFloat({ min: -180, max: 180 })
    .withMessage('Longitude must be between -180 and 180'),
  
  query('radius')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Radius must be a positive number'),
  
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  
  query('limit')
    .optional()
    .isInt({ min: 1, max: 200 })
    .withMessage('Limit must be between 1 and 200'),
  
  query('sort')
    .optional()
    .isString()
    .withMessage('Sort must be a string')
];

module.exports = {
  validateRequest,
  userRegistrationRules,
  userLoginRules,
  violationRules,
  batchViolationsRules,
  idParamRules,
  violationFilterRules
};