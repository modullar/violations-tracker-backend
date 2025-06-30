const mongoose = require('mongoose');
const mongoosePaginate = require('mongoose-paginate-v2');

// Enum for violation types
const ViolationTypes = {
  AIRSTRIKE: 'AIRSTRIKE',
  CHEMICAL_ATTACK: 'CHEMICAL_ATTACK',
  DETENTION: 'DETENTION',
  DISPLACEMENT: 'DISPLACEMENT',
  EXECUTION: 'EXECUTION',
  SHELLING: 'SHELLING',
  SIEGE: 'SIEGE',
  TORTURE: 'TORTURE',
  MURDER: 'MURDER',
  SHOOTING: 'SHOOTING',
  HOME_INVASION: 'HOME_INVASION',
  EXPLOSION: 'EXPLOSION',
  AMBUSH: 'AMBUSH',
  KIDNAPPING: 'KIDNAPPING',
  LANDMINE: 'LANDMINE',
  OTHER: 'OTHER'
};

// Schema for localized string
const LocalizedStringSchema = new mongoose.Schema({
  en: {
    type: String,
    required: [true, 'English text is required']
  },
  ar: {
    type: String,
    required: [false, 'Arabic text is optional']
  }
}, { _id: false });

// Schema for optional localized string
const OptionalLocalizedStringSchema = new mongoose.Schema({
  en: {
    type: String,
    required: false
  },
  ar: {
    type: String,
    required: false
  }
}, { _id: false });

// Schema for victim information
const VictimSchema = new mongoose.Schema({
  age: {
    type: Number,
    min: [0, 'Age must be at least 0'],
    max: [120, 'Age must be less than 120']
  },
  gender: {
    type: String,
    enum: ['male', 'female', 'other', 'unknown'],
    default: 'unknown'
  },
  status: {
    type: String,
    enum: ['civilian', 'combatant', 'unknown'],
    required: [true, 'Status is required'],
    default: 'unknown'
  },
  group_affiliation: {
    type: OptionalLocalizedStringSchema,
    required: false,
    default: { en: '', ar: '' }
  },
  sectarian_identity: {
    type: OptionalLocalizedStringSchema,
    required: false,
    default: { en: '', ar: '' }
  },
  death_date: {
    type: Date,
    validate: {
      validator: function(value) {
        return !value || value <= new Date();
      },
      message: 'Death date cannot be in the future'
    }
  }
}, { _id: false });

// Location schema with GeoJSON for coordinates
const LocationSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['Point'],
    default: 'Point'
  },
  coordinates: {
    type: [Number],
    required: false,
    validate: {
      validator: function(value) {
        if (!value) return true;
        if (value.length !== 2) return false;
        const [longitude, latitude] = value;
        return longitude >= -180 && longitude <= 180 && latitude >= -90 && latitude <= 90;
      },
      message: 'Coordinates must be an array of two numbers [longitude, latitude] with valid ranges'
    }
  },
  name: {
    type: LocalizedStringSchema,
    required: [true, 'Location name is required'],
    validate: {
      validator: function(value) {
        return value && value.en && value.en.length >= 2 && value.en.length <= 100;
      },
      message: 'English location name must be between 2 and 100 characters'
    }
  },
  administrative_division: {
    type: LocalizedStringSchema,
    default: { en: '', ar: '' }
  }
}, { _id: false });

// Main Violation schema
const ViolationSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: Object.values(ViolationTypes),
    required: [true, 'Violation type is required']
  },
  date: {
    type: Date,
    required: [true, 'Incident date is required'],
    validate: {
      validator: function(value) {
        return value <= new Date();
      },
      message: 'Incident date cannot be in the future'
    }
  },
  reported_date: {
    type: Date,
    validate: {
      validator: function(value) {
        if (!value) return true;
        const now = new Date();
        const reportedDate = new Date(value);
        
        // Only set time to end of day for date-only strings (when time is 00:00:00)
        // This handles cases where users input just dates without times
        if (reportedDate.getHours() === 0 && reportedDate.getMinutes() === 0 && 
            reportedDate.getSeconds() === 0 && reportedDate.getMilliseconds() === 0) {
          reportedDate.setHours(23, 59, 59, 999);
        }
        
        // Allow for a 24-hour buffer to account for timezone differences
        const buffer = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
        const maxAllowedDate = new Date(now.getTime() + buffer);
        return reportedDate <= maxAllowedDate;
      },
      message: 'Reported date cannot be more than 24 hours in the future'
    }
  },
  location: {
    type: LocationSchema,
    required: [true, 'Location information is required']
  },
  description: {
    type: LocalizedStringSchema,
    required: [true, 'Description is required'],
    validate: {
      validator: function(value) {
        return value && value.en && value.en.length >= 10 && value.en.length <= 2000;
      },
      message: 'English description must be between 10 and 2000 characters'
    }
  },
  source: {
    type: LocalizedStringSchema,
    default: { en: '', ar: '' },
    validate: {
      validator: function(value) {
        if (!value) return true;
        if (value.en && value.en.length > 1500) return false;
        if (value.ar && value.ar.length > 1500) return false;
        return true;
      },
      message: 'Source cannot be more than 1500 characters in either language'
    }
  },
  source_url: {
    type: LocalizedStringSchema,
    default: { en: '', ar: '' },
    validate: {
      validator: function(value) {
        if (!value) return true;
        const validateUrl = (url) => !url || /^(https?:\/\/)?([a-z0-9.-]+)\.([a-z.]{2,6})([/\w .-]*)*\/?$/.test(url);
        if (value.en && !validateUrl(value.en)) return false;
        if (value.ar && !validateUrl(value.ar)) return false;
        if (value.en && value.en.length > 500) return false;
        if (value.ar && value.ar.length > 500) return false;
        return true;
      },
      message: 'One or more source URLs are invalid or exceed 500 characters'
    }
  },
  verified: {
    type: Boolean,
    required: [true, 'Verification status is required'],
    default: false
  },
  certainty_level: {
    type: String,
    enum: ['confirmed', 'probable', 'possible'],
    required: [true, 'Certainty level is required']
  },
  verification_method: {
    type: OptionalLocalizedStringSchema,
    required: false,
    default: { en: '', ar: '' },
    validate: {
      validator: function(value) {
        if (!value) return true;
        if (value.en && value.en.length > 500) return false;
        if (value.ar && value.ar.length > 500) return false;
        return true;
      },
      message: 'Verification method cannot be more than 500 characters in either language'
    }
  },
  casualties: {
    type: Number,
    min: [0, 'Casualties cannot be negative'],
    default: 0
  },
  kidnapped_count: {
    type: Number,
    min: [0, 'Kidnapped count cannot be negative'],
    default: 0
  },
  detained_count: {
    type: Number,
    min: [0, 'Detained count cannot be negative'],
    default: 0
  },
  injured_count: {
    type: Number,
    min: [0, 'Injured count cannot be negative'],
    default: 0
  },
  displaced_count: {
    type: Number,
    min: [0, 'Displaced count cannot be negative'],
    default: 0
  },
  victims: {
    type: [VictimSchema],
    default: []
  },
  perpetrator: {
    type: OptionalLocalizedStringSchema,
    default: { en: '', ar: '' },
    validate: {
      validator: function(value) {
        if (!value) return true;
        if (value.en && value.en.length > 200) return false;
        if (value.ar && value.ar.length > 200) return false;
        return true;
      },
      message: 'Perpetrator cannot be more than 200 characters in either language'
    }
  },
  perpetrator_affiliation: {
    type: String,
    enum: ['assad_regime', 'post_8th_december_government', 'various_armed_groups', 'isis', 'sdf', 'israel', 'turkey', 'druze_militias', 'russia', 'iran_shia_militias', 'international_coalition', 'unknown'],
    required: [true, 'Perpetrator affiliation is required'],
    default: 'unknown'
  },
  media_links: {
    type: [String],
    validate: {
      validator: function(v) {
        if (!v) return true;
        return v.every(url => /^(https?:\/\/)?([a-z0-9.-]+)\.([a-z.]{2,6})([/\w .-]*)*\/?$/.test(url));
      },
      message: 'One or more media links are invalid URLs'
    }
  },
  tags: {
    type: [{
      en: String,
      ar: String
    }],
    validate: {
      validator: function(v) {
        if (!v) return true;
        return v.every(tag => (!tag.en || tag.en.length <= 50) && (!tag.ar || tag.ar.length <= 50));
      },
      message: 'Tags cannot be more than 50 characters each in either language'
    }
  },
  related_violations: {
    type: [String]
  },
  created_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  updated_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Create a 2dsphere index for geospatial queries
ViolationSchema.index({ 'location.coordinates': '2dsphere' });

// Add pagination plugin
ViolationSchema.plugin(mongoosePaginate);

// Format dates to YYYY-MM-DD when converting to JSON
ViolationSchema.methods.toJSON = function() {
  const violation = this.toObject();
  
  // Format main dates
  if (violation.date) {
    violation.date = violation.date.toISOString().split('T')[0];
  }
  
  if (violation.reported_date) {
    violation.reported_date = violation.reported_date.toISOString().split('T')[0];
  }
  
  // Format victim death dates
  if (violation.victims && violation.victims.length > 0) {
    violation.victims = violation.victims.map(victim => {
      if (victim.death_date) {
        victim.death_date = victim.death_date.toISOString().split('T')[0];
      }
      return victim;
    });
  }
  
  return violation;
};

// Static method for comprehensive validation with business rules
ViolationSchema.statics.validateForCreation = async function(violationData, options = {}) {
  const errors = [];
  
  // Sanitize data first
  const sanitizedData = this.sanitizeData(violationData);
  
  // Business logic validation that goes beyond schema validation
  await this._validateBusinessRules(sanitizedData, errors, options);
  
  if (errors.length > 0) {
    const error = new Error('Validation failed');
    error.name = 'ValidationError';
    error.errors = errors.reduce((acc, err) => {
      acc[err.field] = { message: err.message };
      return acc;
    }, {});
    throw error;
  }
  
  return sanitizedData;
};

// Static method for batch validation
ViolationSchema.statics.validateBatch = async function(violationsData, options = {}) {
  const results = { valid: [], invalid: [] };
  
  for (let i = 0; i < violationsData.length; i++) {
    try {
      const validatedData = await this.validateForCreation(violationsData[i], options);
      results.valid.push({ ...validatedData, _batchIndex: i });
    } catch (error) {
      results.invalid.push({
        index: i,
        violation: violationsData[i],
        errors: error.errors ? Object.values(error.errors).map(e => e.message) : [error.message]
      });
    }
  }
  
  return results;
};

// Business rule validation (beyond schema validation)
ViolationSchema.statics._validateBusinessRules = async function(data, errors, options) {
  // Cross-field validation - ensure counts match violation types
  if (data.type === 'DETENTION' && (!data.detained_count || data.detained_count === 0)) {
    errors.push({
      field: 'detained_count',
      message: 'Detained count is required for detention violations'
    });
  }
  
  if (data.type === 'KIDNAPPING' && (!data.kidnapped_count || data.kidnapped_count === 0)) {
    errors.push({
      field: 'kidnapped_count', 
      message: 'Kidnapped count is required for kidnapping violations'
    });
  }
  
  if (data.type === 'DISPLACEMENT' && (!data.displaced_count || data.displaced_count === 0)) {
    errors.push({
      field: 'displaced_count',
      message: 'Displaced count is required for displacement violations'
    });
  }
  
  // Location validation for geocoding requirements
  if (!data.location?.name?.en && options.requiresGeocoding !== false) {
    errors.push({
      field: 'location.name.en',
      message: 'English location name is required for geocoding'
    });
  }
  
  // Conditional validation based on verification status
  if (data.verified && !data.verification_method?.en?.trim()) {
    errors.push({
      field: 'verification_method.en',
      message: 'Verification method is required for verified violations'
    });
  }
  
  // Validate victim counts vs actual victims array
  if (data.victims && data.victims.length > 0) {
    const deadVictims = data.victims.filter(v => v.death_date).length;
    if (data.casualties && deadVictims > data.casualties) {
      errors.push({
        field: 'casualties',
        message: 'Casualties count cannot be less than the number of victims with death dates'
      });
    }
  }
  
  // Validate date relationships
  if (data.date && data.reported_date) {
    const incidentDate = new Date(data.date);
    const reportedDate = new Date(data.reported_date);
    
    // Reported date should not be significantly earlier than incident date
    const daysDiff = (incidentDate - reportedDate) / (1000 * 60 * 60 * 24);
    if (daysDiff > 365) { // More than a year gap
      errors.push({
        field: 'reported_date',
        message: 'Reported date cannot be more than a year before the incident date'
      });
    }
  }
  
  // Validate victim death dates against incident date
  if (data.victims && data.victims.length > 0 && data.date) {
    const incidentDate = new Date(data.date);
    data.victims.forEach((victim, index) => {
      if (victim.death_date) {
        const deathDate = new Date(victim.death_date);
        if (deathDate < incidentDate) {
          errors.push({
            field: `victims[${index}].death_date`,
            message: 'Victim death date cannot be before the incident date'
          });
        }
      }
    });
  }
};

// Static method for sanitization/normalization
ViolationSchema.statics.sanitizeData = function(violationData) {
  const sanitized = JSON.parse(JSON.stringify(violationData)); // Deep clone
  
  // Normalize dates
  if (sanitized.date && sanitized.date !== '') {
    if (typeof sanitized.date === 'string') {
      sanitized.date = new Date(sanitized.date);
    }
  } else {
    sanitized.date = null;
  }
  
  if (sanitized.reported_date && sanitized.reported_date !== '') {
    if (typeof sanitized.reported_date === 'string') {
      sanitized.reported_date = new Date(sanitized.reported_date);
    }
  } else {
    sanitized.reported_date = null;
  }
  
  // Handle missing dates by defaulting to each other
  const hasValidDate = sanitized.date && sanitized.date instanceof Date && !isNaN(sanitized.date.getTime());
  const hasValidReportedDate = sanitized.reported_date && sanitized.reported_date instanceof Date && !isNaN(sanitized.reported_date.getTime());
  
  if (hasValidDate && !hasValidReportedDate) {
    // If violation date exists but reported date doesn't, use violation date as reported date
    sanitized.reported_date = new Date(sanitized.date);
  } else if (hasValidReportedDate && !hasValidDate) {
    // If reported date exists but violation date doesn't, use reported date as violation date
    sanitized.date = new Date(sanitized.reported_date);
  }
  
  // Clean up null values (set to undefined so they're not included in the final object if not needed)
  if (sanitized.date === null) {
    delete sanitized.date;
  }
  if (sanitized.reported_date === null) {
    delete sanitized.reported_date;
  }
  
  // Normalize victim death dates
  if (sanitized.victims && sanitized.victims.length > 0) {
    sanitized.victims = sanitized.victims.map(victim => {
      if (victim.death_date && typeof victim.death_date === 'string') {
        victim.death_date = new Date(victim.death_date);
      }
      return victim;
    });
  }
  
  // Set required defaults
  if (sanitized.verified === undefined) sanitized.verified = false;
  if (!sanitized.perpetrator_affiliation) sanitized.perpetrator_affiliation = 'unknown';
  if (!sanitized.certainty_level) sanitized.certainty_level = 'possible';
  
  // Ensure numeric fields are numbers
  ['casualties', 'kidnapped_count', 'detained_count', 'injured_count', 'displaced_count'].forEach(field => {
    if (sanitized[field] !== undefined && sanitized[field] !== null) {
      sanitized[field] = Number(sanitized[field]) || 0;
    }
  });
  
  // Ensure required localized strings have proper structure
  ['description', 'perpetrator', 'source', 'source_url', 'verification_method'].forEach(field => {
    if (sanitized[field] && typeof sanitized[field] === 'string') {
      // Convert plain string to localized object
      sanitized[field] = { en: sanitized[field], ar: '' };
    } else if (!sanitized[field]) {
      if (field === 'description') {
        // Required fields get minimal structure
        sanitized[field] = { en: '', ar: '' };
      } else {
        // Optional fields get default empty structure
        sanitized[field] = { en: '', ar: '' };
      }
    }
  });
  
  // Ensure location has proper structure
  if (sanitized.location) {
    if (sanitized.location.name && typeof sanitized.location.name === 'string') {
      sanitized.location.name = { en: sanitized.location.name, ar: '' };
    }
    if (!sanitized.location.administrative_division) {
      sanitized.location.administrative_division = { en: '', ar: '' };
    } else if (typeof sanitized.location.administrative_division === 'string') {
      sanitized.location.administrative_division = { 
        en: sanitized.location.administrative_division, 
        ar: '' 
      };
    }
  }
  
  return sanitized;
};

module.exports = mongoose.model('Violation', ViolationSchema);