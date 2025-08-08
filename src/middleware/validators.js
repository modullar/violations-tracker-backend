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
    .isInt({ min: 1, max: 600 })
    .withMessage('Limit must be between 1 and 600'),
  
  query('sort')
    .optional()
    .isString()
    .withMessage('Sort must be a string')
];

// Territory control validation rules
const territoryControlRules = [
  body('type')
    .optional()
    .isIn(['FeatureCollection'])
    .withMessage('Type must be "FeatureCollection"'),
  
  body('date')
    .notEmpty()
    .withMessage('Territory control date is required')
    .isISO8601()
    .withMessage('Date must be a valid ISO date (YYYY-MM-DD)'),
  
  body('features')
    .notEmpty()
    .withMessage('Features are required')
    .isArray({ min: 1 })
    .withMessage('At least one feature is required'),
  
  body('features.*.type')
    .optional()
    .isIn(['Feature'])
    .withMessage('Feature type must be "Feature"'),
  
  body('features.*.properties.name')
    .notEmpty()
    .withMessage('Feature name is required')
    .isLength({ max: 100 })
    .withMessage('Feature name cannot exceed 100 characters'),
  
  body('features.*.properties.controlledBy')
    .notEmpty()
    .withMessage('Controlled by field is required')
    .isIn([
      'assad_regime', 'post_8th_december_government', 'various_armed_groups',
      'isis', 'sdf', 'israel', 'turkey', 'druze_militias', 'russia',
      'iran_shia_militias', 'international_coalition', 'unknown',
      'FOREIGN_MILITARY', 'REBEL_GROUP'
    ])
    .withMessage('Invalid controller type'),
  
  body('features.*.properties.color')
    .optional()
    .custom((value) => {
      if (!value) return true; // Allow empty/null values
      
      // Allow hex colors with or without #
      if (/^#?[0-9A-Fa-f]{3}$/.test(value)) return true; // 3-digit hex
      if (/^#?[0-9A-Fa-f]{6}$/.test(value)) return true; // 6-digit hex
      
      // Allow common CSS color names
      const colorNames = [
        'red', 'blue', 'green', 'yellow', 'orange', 'purple', 'pink',
        'brown', 'black', 'white', 'gray', 'grey', 'cyan', 'magenta',
        'lime', 'maroon', 'navy', 'olive', 'silver', 'teal', 'aqua',
        'fuchsia', 'darkred', 'darkblue', 'darkgreen', 'darkorange',
        'darkviolet', 'lightblue', 'lightgreen', 'lightyellow'
      ];
      
      return colorNames.includes(value.toLowerCase());
    })
    .withMessage('Color must be a valid hex color code (with or without #), 3 or 6 digits, or a valid CSS color name'),
  
  body('features.*.properties.controlledSince')
    .optional(),
  
  body('features.*.geometry')
    .notEmpty()
    .withMessage('Feature geometry is required')
    .isObject()
    .withMessage('Geometry must be an object'),
  
  body('features.*.geometry.type')
    .notEmpty()
    .withMessage('Geometry type is required')
    .isIn(['Polygon', 'MultiPolygon'])
    .withMessage('Geometry type must be "Polygon" or "MultiPolygon"'),
  
  body('features.*.geometry.coordinates')
    .notEmpty()
    .withMessage('Geometry coordinates are required')
    .isArray()
    .withMessage('Coordinates must be an array'),
  
  body('metadata.source')
    .optional()
    .isString()
    .withMessage('Metadata source must be a string'),
  
  body('metadata.accuracy')
    .optional()
    .isIn(['high', 'medium', 'low', 'estimated'])
    .withMessage('Accuracy must be one of: high, medium, low, estimated'),
  
  body('allowDuplicateDates')
    .optional()
    .isBoolean()
    .withMessage('Allow duplicate dates must be a boolean')
];

// Territory control update validation rules
const territoryControlUpdateRules = [
  body('date')
    .optional()
    .isISO8601()
    .withMessage('Date must be a valid ISO date (YYYY-MM-DD)'),
  
  body('features')
    .optional()
    .isArray({ min: 1 })
    .withMessage('Features must be an array with at least one feature'),
  
  body('features.*.properties.name')
    .optional()
    .isLength({ max: 100 })
    .withMessage('Feature name cannot exceed 100 characters'),
  
  body('features.*.properties.controlledBy')
    .optional()
    .isIn([
      'assad_regime', 'post_8th_december_government', 'various_armed_groups',
      'isis', 'sdf', 'israel', 'turkey', 'druze_militias', 'russia',
      'iran_shia_militias', 'international_coalition', 'unknown',
      'FOREIGN_MILITARY', 'REBEL_GROUP'
    ])
    .withMessage('Invalid controller type'),
  
  body('features.*.properties.color')
    .optional()
    .custom((value) => {
      if (!value) return true; // Allow empty/null values
      
      // Allow hex colors with or without #
      if (/^#?[0-9A-Fa-f]{3}$/.test(value)) return true; // 3-digit hex
      if (/^#?[0-9A-Fa-f]{6}$/.test(value)) return true; // 6-digit hex
      
      // Allow common CSS color names
      const colorNames = [
        'red', 'blue', 'green', 'yellow', 'orange', 'purple', 'pink',
        'brown', 'black', 'white', 'gray', 'grey', 'cyan', 'magenta',
        'lime', 'maroon', 'navy', 'olive', 'silver', 'teal', 'aqua',
        'fuchsia', 'darkred', 'darkblue', 'darkgreen', 'darkorange',
        'darkviolet', 'lightblue', 'lightgreen', 'lightyellow'
      ];
      
      return colorNames.includes(value.toLowerCase());
    })
    .withMessage('Color must be a valid hex color code (with or without #), 3 or 6 digits, or a valid CSS color name'),
  
  body('features.*.properties.controlledSince')
    .optional(),
  
  body('allowDuplicateDates')
    .optional()
    .isBoolean()
    .withMessage('Allow duplicate dates must be a boolean')
];

// Territory control metadata validation rules
const territoryControlMetadataRules = [
  body('source')
    .optional()
    .isString()
    .withMessage('Source must be a string'),
  
  body('accuracy')
    .optional()
    .isIn(['high', 'medium', 'low', 'estimated'])
    .withMessage('Accuracy must be one of: high, medium, low, estimated'),
  
  body('description')
    .optional()
    .isObject()
    .withMessage('Description must be an object'),
  
  body('description.en')
    .optional()
    .isString()
    .withMessage('English description must be a string'),
  
  body('description.ar')
    .optional()
    .isString()
    .withMessage('Arabic description must be a string')
];

// Territory control feature validation rules
const territoryControlFeatureRules = [
  body('type')
    .optional()
    .isIn(['Feature'])
    .withMessage('Feature type must be "Feature"'),
  
  body('properties.name')
    .notEmpty()
    .withMessage('Feature name is required')
    .isLength({ max: 100 })
    .withMessage('Feature name cannot exceed 100 characters'),
  
  body('properties.controlledBy')
    .notEmpty()
    .withMessage('Controlled by field is required')
    .isIn([
      'assad_regime', 'post_8th_december_government', 'various_armed_groups',
      'isis', 'sdf', 'israel', 'turkey', 'druze_militias', 'russia',
      'iran_shia_militias', 'international_coalition', 'unknown',
      'FOREIGN_MILITARY', 'REBEL_GROUP'
    ])
    .withMessage('Invalid controller type'),
  
  body('properties.color')
    .optional()
    .custom((value) => {
      if (!value) return true; // Allow empty/null values
      
      // Allow hex colors with or without #
      if (/^#?[0-9A-Fa-f]{3}$/.test(value)) return true; // 3-digit hex
      if (/^#?[0-9A-Fa-f]{6}$/.test(value)) return true; // 6-digit hex
      
      // Allow common CSS color names
      const colorNames = [
        'red', 'blue', 'green', 'yellow', 'orange', 'purple', 'pink',
        'brown', 'black', 'white', 'gray', 'grey', 'cyan', 'magenta',
        'lime', 'maroon', 'navy', 'olive', 'silver', 'teal', 'aqua',
        'fuchsia', 'darkred', 'darkblue', 'darkgreen', 'darkorange',
        'darkviolet', 'lightblue', 'lightgreen', 'lightyellow'
      ];
      
      return colorNames.includes(value.toLowerCase());
    })
    .withMessage('Color must be a valid hex color code (with or without #), 3 or 6 digits, or a valid CSS color name'),
  
  body('properties.controlledSince')
    .optional(),
  
  body('geometry')
    .notEmpty()
    .withMessage('Feature geometry is required')
    .isObject()
    .withMessage('Geometry must be an object'),
  
  body('geometry.type')
    .notEmpty()
    .withMessage('Geometry type is required')
    .isIn(['Polygon', 'MultiPolygon'])
    .withMessage('Geometry type must be "Polygon" or "MultiPolygon"'),
  
  body('geometry.coordinates')
    .notEmpty()
    .withMessage('Geometry coordinates are required')
    .isArray()
    .withMessage('Coordinates must be an array')
];

// Date parameter validation rules
const dateParamRules = [
  param('date')
    .notEmpty()
    .withMessage('Date parameter is required')
    .isISO8601()
    .withMessage('Date must be a valid ISO date (YYYY-MM-DD)')
];

// Territory control filtering validation rules
const territoryControlFilterRules = [
  query('startDate')
    .optional()
    .isISO8601()
    .withMessage('Start date must be a valid ISO date (YYYY-MM-DD)'),
  
  query('endDate')
    .optional()
    .isISO8601()
    .withMessage('End date must be a valid ISO date (YYYY-MM-DD)'),
  
  query('date')
    .optional()
    .isISO8601()
    .withMessage('Date must be a valid ISO date (YYYY-MM-DD)'),
  
  query('controlledBy')
    .optional()
    .isIn([
      'assad_regime', 'post_8th_december_government', 'various_armed_groups',
      'isis', 'sdf', 'israel', 'turkey', 'druze_militias', 'russia',
      'iran_shia_militias', 'international_coalition', 'unknown',
      'FOREIGN_MILITARY', 'REBEL_GROUP'
    ])
    .withMessage('Invalid controller type'),
  
  query('territoryName')
    .optional()
    .isString()
    .withMessage('Territory name must be a string'),
  
  query('source')
    .optional()
    .isString()
    .withMessage('Source must be a string'),
  
  query('accuracy')
    .optional()
    .isIn(['high', 'medium', 'low', 'estimated'])
    .withMessage('Accuracy must be one of: high, medium, low, estimated'),
  
  query('controlledSinceStart')
    .optional()
    .isISO8601()
    .withMessage('Controlled since start must be a valid ISO date'),
  
  query('controlledSinceEnd')
    .optional()
    .isISO8601()
    .withMessage('Controlled since end must be a valid ISO date'),
  
  query('description')
    .optional()
    .isString()
    .withMessage('Description must be a string'),
  
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
  violationFilterRules,
  territoryControlRules,
  territoryControlUpdateRules,
  territoryControlMetadataRules,
  territoryControlFeatureRules,
  dateParamRules,
  territoryControlFilterRules
};