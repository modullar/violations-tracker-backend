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

// Violation creation/update validation rules
const violationRules = [
  body('type')
    .notEmpty()
    .withMessage('Violation type is required')
    .isIn([
      'AIRSTRIKE', 'CHEMICAL_ATTACK', 'DETENTION', 'DISPLACEMENT', 
      'EXECUTION', 'SHELLING', 'SIEGE', 'TORTURE', 'MURDER', 
      'SHOOTING', 'HOME_INVASION', 'EXPLOSION', 'AMBUSH', 'KIDNAPPING', 'LANDMINE', 'OTHER'
    ])
    .withMessage('Invalid violation type'),
  
  body('date')
    .notEmpty()
    .withMessage('Incident date is required')
    .isISO8601()
    .withMessage('Date must be a valid ISO date (YYYY-MM-DD)')
    .custom(value => {
      if (new Date(value) > new Date()) {
        throw new Error('Incident date cannot be in the future');
      }
      return true;
    }),
  
  body('reported_date')
    .optional()
    .isISO8601()
    .withMessage('Reported date must be a valid ISO date (YYYY-MM-DD)')
    .custom(value => {
      if (new Date(value) > new Date()) {
        throw new Error('Reported date cannot be in the future');
      }
      return true;
    }),
  
  body('location')
    .notEmpty()
    .withMessage('Location is required')
    .isObject()
    .withMessage('Location must be an object'),
  
  body('location.coordinates')
    .optional()
    .isArray()
    .withMessage('Coordinates must be an array')
    .custom(value => {
      if (value && value.length !== 2) {
        throw new Error('Coordinates must contain exactly 2 values [longitude, latitude]');
      }
      
      if (value) {
        const [longitude, latitude] = value;
        
        if (longitude < -180 || longitude > 180) {
          throw new Error('Longitude must be between -180 and 180');
        }
        
        if (latitude < -90 || latitude > 90) {
          throw new Error('Latitude must be between -90 and 90');
        }
      }
      
      return true;
    }),
  
  body('location.name')
    .notEmpty()
    .withMessage('Location name is required')
    .isLength({ min: 2, max: 100 })
    .withMessage('Location name must be between 2 and 100 characters'),
  
  body('location.administrative_division')
    .optional()
    .isLength({ max: 100 })
    .withMessage('Administrative division cannot be more than 100 characters'),
  
  body('description')
    .notEmpty()
    .withMessage('Description is required')
    .isLength({ min: 10, max: 2000 })
    .withMessage('Description must be between 10 and 2000 characters'),
  
  body('source')
    .optional()
    .isLength({ max: 1500 })
    .withMessage('Source cannot be more than 1500 characters'),
  
  body('source_url')
    .optional()
    .isObject()
    .withMessage('Source URL must be an object with language codes'),
  
  body('source_url.en')
    .optional()
    .isURL()
    .withMessage('English source URL must be a valid URL')
    .isLength({ max: 500 })
    .withMessage('English source URL cannot be more than 500 characters'),
  
  body('source_url.ar')
    .optional()
    .isURL()
    .withMessage('Arabic source URL must be a valid URL')
    .isLength({ max: 500 })
    .withMessage('Arabic source URL cannot be more than 500 characters'),
  
  body('verified')
    .notEmpty()
    .withMessage('Verification status is required')
    .isBoolean()
    .withMessage('Verified must be a boolean value'),
  
  body('certainty_level')
    .notEmpty()
    .withMessage('Certainty level is required')
    .isIn(['confirmed', 'probable', 'possible'])
    .withMessage('Certainty level must be one of: confirmed, probable, possible'),
  
  body('verification_method')
    .optional()
    .isLength({ max: 500 })
    .withMessage('Verification method cannot be more than 500 characters'),
  
  body('casualties')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Casualties must be a non-negative integer'),
  
  body('victims')
    .optional()
    .isArray()
    .withMessage('Victims must be an array'),
  
  body('victims.*.age')
    .optional()
    .custom(value => {
      if (value === null || value === undefined) return true;
      if (typeof value !== 'number') return false;
      if (value < 0 || value > 120) return false;
      return true;
    })
    .withMessage('Victim age must be between 0 and 120, or null'),
  
  body('victims.*.gender')
    .optional()
    .isIn(['male', 'female', 'other', 'unknown'])
    .withMessage('Victim gender must be one of: male, female, other, unknown'),
  
  body('victims.*.status')
    .notEmpty()
    .withMessage('Victim status is required')
    .isIn(['civilian', 'combatant', 'unknown'])
    .withMessage('Victim status must be one of: civilian, combatant, unknown'),
  
  body('victims.*.death_date')
    .optional()
    .custom(value => {
      if (value === null || value === undefined) return true;
      if (!value) return true;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        throw new Error('Death date must be a valid ISO date (YYYY-MM-DD)');
      }
      if (new Date(value) > new Date()) {
        throw new Error('Death date cannot be in the future');
      }
      return true;
    })
    .withMessage('Death date must be a valid ISO date (YYYY-MM-DD) or null'),
  
  body('perpetrator')
    .optional()
    .isLength({ max: 200 })
    .withMessage('Perpetrator cannot be more than 200 characters'),
  
  body('perpetrator_affiliation')
    .optional()
    .isIn(['assad_regime', 'post_8th_december_government', 'various_armed_groups', 'isis', 'sdf', 'israel', 'turkey', 'druze_militias', 'russia', 'iran_shia_militias', 'unknown'])
    .withMessage('Invalid perpetrator affiliation'),
  
  body('media_links')
    .optional()
    .isArray()
    .withMessage('Media links must be an array'),
  
  body('media_links.*')
    .optional()
    .isURL()
    .withMessage('Media links must be valid URLs'),
  
  body('tags')
    .optional()
    .isArray()
    .withMessage('Tags must be an array'),
  
  body('tags.*')
    .optional()
    .isLength({ max: 50 })
    .withMessage('Tags cannot be more than 50 characters each'),
  
  body('related_violations')
    .optional()
    .isArray()
    .withMessage('Related violations must be an array')
];

// Batch violations validation
const batchViolationsRules = [
  body()
    .isArray()
    .withMessage('Request body must be an array of violations')
    .notEmpty()
    .withMessage('At least one violation must be provided'),
  body('*.type')
    .notEmpty()
    .withMessage('Violation type is required')
    .isIn([
      'AIRSTRIKE', 'CHEMICAL_ATTACK', 'DETENTION', 'DISPLACEMENT', 
      'EXECUTION', 'SHELLING', 'SIEGE', 'TORTURE', 'MURDER', 
      'SHOOTING', 'HOME_INVASION', 'EXPLOSION', 'AMBUSH', 'KIDNAPPING', 'LANDMINE', 'OTHER'
    ])
    .withMessage('Invalid violation type'),
  
  body('*.date')
    .notEmpty()
    .withMessage('Incident date is required')
    .isISO8601()
    .withMessage('Date must be a valid ISO date (YYYY-MM-DD)')
    .custom(value => {
      if (new Date(value) > new Date()) {
        throw new Error('Incident date cannot be in the future');
      }
      return true;
    }),
  
  body('*.reported_date')
    .optional()
    .isISO8601()
    .withMessage('Reported date must be a valid ISO date (YYYY-MM-DD)')
    .custom(value => {
      if (new Date(value) > new Date()) {
        throw new Error('Reported date cannot be in the future');
      }
      return true;
    }),
  
  body('*.location')
    .notEmpty()
    .withMessage('Location is required')
    .isObject()
    .withMessage('Location must be an object'),
  
  body('*.location.coordinates')
    .optional()
    .isArray()
    .withMessage('Coordinates must be an array')
    .custom(value => {
      if (value && value.length !== 2) {
        throw new Error('Coordinates must contain exactly 2 values [longitude, latitude]');
      }
      
      if (value) {
        const [longitude, latitude] = value;
        
        if (longitude < -180 || longitude > 180) {
          throw new Error('Longitude must be between -180 and 180');
        }
        
        if (latitude < -90 || latitude > 90) {
          throw new Error('Latitude must be between -90 and 90');
        }
      }
      
      return true;
    }),
  
  body('*.location.name')
    .notEmpty()
    .withMessage('Location name is required')
    .isLength({ min: 2, max: 100 })
    .withMessage('Location name must be between 2 and 100 characters'),
  
  body('*.location.administrative_division')
    .optional()
    .isLength({ max: 100 })
    .withMessage('Administrative division cannot be more than 100 characters'),
  
  body('*.description')
    .notEmpty()
    .withMessage('Description is required')
    .isLength({ min: 10, max: 2000 })
    .withMessage('Description must be between 10 and 2000 characters'),
  
  body('*.source')
    .optional()
    .isLength({ max: 1500 })
    .withMessage('Source cannot be more than 1500 characters'),
  
  body('*.source_url')
    .optional()
    .isObject()
    .withMessage('Source URL must be an object with language codes'),
  
  body('*.source_url.en')
    .optional()
    .isURL()
    .withMessage('English source URL must be a valid URL')
    .isLength({ max: 500 })
    .withMessage('English source URL cannot be more than 500 characters'),
  
  body('*.source_url.ar')
    .optional()
    .isURL()
    .withMessage('Arabic source URL must be a valid URL')
    .isLength({ max: 500 })
    .withMessage('Arabic source URL cannot be more than 500 characters'),
  
  body('*.verified')
    .notEmpty()
    .withMessage('Verification status is required')
    .isBoolean()
    .withMessage('Verified must be a boolean value'),
  
  body('*.certainty_level')
    .notEmpty()
    .withMessage('Certainty level is required')
    .isIn(['confirmed', 'probable', 'possible'])
    .withMessage('Certainty level must be one of: confirmed, probable, possible'),
  
  body('*.verification_method')
    .optional()
    .isLength({ max: 500 })
    .withMessage('Verification method cannot be more than 500 characters'),
  
  body('*.casualties')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Casualties must be a non-negative integer'),
  
  body('*.victims')
    .optional()
    .isArray()
    .withMessage('Victims must be an array'),
  
  body('*.victims.*.age')
    .optional()
    .custom(value => {
      if (value === null || value === undefined) return true;
      if (typeof value !== 'number') return false;
      if (value < 0 || value > 120) return false;
      return true;
    })
    .withMessage('Victim age must be between 0 and 120, or null'),
  
  body('*.victims.*.gender')
    .optional()
    .isIn(['male', 'female', 'other', 'unknown'])
    .withMessage('Victim gender must be one of: male, female, other, unknown'),
  
  body('*.victims.*.status')
    .notEmpty()
    .withMessage('Victim status is required')
    .isIn(['civilian', 'combatant', 'unknown'])
    .withMessage('Victim status must be one of: civilian, combatant, unknown'),
  
  body('*.victims.*.death_date')
    .optional()
    .custom(value => {
      if (value === null || value === undefined) return true;
      if (!value) return true;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        throw new Error('Death date must be a valid ISO date (YYYY-MM-DD)');
      }
      if (new Date(value) > new Date()) {
        throw new Error('Death date cannot be in the future');
      }
      return true;
    })
    .withMessage('Death date must be a valid ISO date (YYYY-MM-DD) or null'),
  
  body('*.perpetrator')
    .optional()
    .isLength({ max: 200 })
    .withMessage('Perpetrator cannot be more than 200 characters'),
  
  body('*.perpetrator_affiliation')
    .optional()
    .isIn(['assad_regime', 'post_8th_december_government', 'various_armed_groups', 'isis', 'sdf', 'israel', 'turkey', 'druze_militias', 'russia', 'iran_shia_militias', 'unknown'])
    .withMessage('Invalid perpetrator affiliation'),
  
  body('*.media_links')
    .optional()
    .isArray()
    .withMessage('Media links must be an array'),
  
  body('*.media_links.*')
    .optional()
    .isURL()
    .withMessage('Media links must be valid URLs'),
  
  body('*.tags')
    .optional()
    .isArray()
    .withMessage('Tags must be an array'),
  
  body('*.tags.*')
    .optional()
    .isLength({ max: 50 })
    .withMessage('Tags cannot be more than 50 characters each'),
  
  body('*.related_violations')
    .optional()
    .isArray()
    .withMessage('Related violations must be an array')
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