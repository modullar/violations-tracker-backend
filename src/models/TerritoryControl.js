const mongoose = require('mongoose');
const mongoosePaginate = require('mongoose-paginate-v2');

// Schema for localized string
const LocalizedStringSchema = new mongoose.Schema({
  en: {
    type: String,
    required: false
  },
  ar: {
    type: String,
    required: false
  }
}, { _id: false });

// Schema for territory control feature properties
const TerritoryFeaturePropertiesSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Territory name is required'],
    trim: true,
    maxlength: [100, 'Territory name cannot exceed 100 characters']
  },
  controlledBy: {
    type: String,
    enum: [
      'assad_regime',
      'post_8th_december_government', 
      'various_armed_groups',
      'isis',
      'sdf',
      'israel',
      'turkey',
      'druze_militias',
      'russia',
      'iran_shia_militias',
      'international_coalition',
      'unknown',
      'FOREIGN_MILITARY',
      'REBEL_GROUP'
    ],
    required: [true, 'Controlled by field is required']
  },
  color: {
    type: String,
    required: false,
    validate: {
      validator: function(value) {
        // Allow empty/null values
        if (!value) return true;
        
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
      },
      message: 'Color must be a valid hex color code (with or without #), 3 or 6 digits, or a valid CSS color name'
    }
  },
  controlledSince: {
    type: Date,
    required: false
  },
  description: {
    type: LocalizedStringSchema,
    default: { en: '', ar: '' }
  }
}, { _id: false });

// Schema for GeoJSON geometry
const GeometrySchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['Polygon', 'MultiPolygon'],
    required: [true, 'Geometry type is required']
  },
  coordinates: {
    type: mongoose.Schema.Types.Mixed,
    required: [true, 'Coordinates are required'],
    validate: {
      validator: function(value) {
        // Basic validation for GeoJSON coordinates structure
        if (!Array.isArray(value)) return false;
        
        if (this.type === 'Polygon') {
          // Polygon should be array of LinearRing coordinates
          return value.length >= 1 && Array.isArray(value[0]) && value[0].length >= 4;
        } else if (this.type === 'MultiPolygon') {
          // MultiPolygon should be array of Polygon coordinate arrays
          return value.length >= 1 && Array.isArray(value[0]) && Array.isArray(value[0][0]);
        }
        
        return false;
      },
      message: 'Invalid GeoJSON coordinates structure'
    }
  }
}, { _id: false });

// Schema for territory control feature
const TerritoryFeatureSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['Feature'],
    default: 'Feature',
    required: true
  },
  properties: {
    type: TerritoryFeaturePropertiesSchema,
    required: [true, 'Feature properties are required']
  },
  geometry: {
    type: GeometrySchema,
    required: [true, 'Feature geometry is required']
  }
}, { _id: false });

// Main TerritoryControl schema
const TerritoryControlSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['FeatureCollection'],
    default: 'FeatureCollection',
    required: true
  },
  date: {
    type: Date,
    required: [true, 'Territory control date is required'],
    validate: {
      validator: function(value) {
        return value <= new Date();
      },
      message: 'Territory control date cannot be in the future'
    }
  },
  features: {
    type: [TerritoryFeatureSchema],
    required: [true, 'Features are required'],
    validate: {
      validator: function(value) {
        return Array.isArray(value) && value.length > 0;
      },
      message: 'At least one feature is required'
    }
  },
  metadata: {
    source: {
      type: String,
      default: 'manual_entry',
      trim: true
    },
    description: {
      type: LocalizedStringSchema,
      default: { en: '', ar: '' }
    },
    accuracy: {
      type: String,
      enum: ['high', 'medium', 'low', 'estimated'],
      default: 'medium'
    },
    lastVerified: {
      type: Date,
      default: Date.now
    }
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

// Create indexes for efficient querying
TerritoryControlSchema.index({ date: -1 }); // Most common query - by date
TerritoryControlSchema.index({ 'features.properties.controlledBy': 1, date: -1 }); // Filter by controller and date
TerritoryControlSchema.index({ 'features.properties.controlledSince': -1 }); // Query by control establishment date
TerritoryControlSchema.index({ 'features.geometry': '2dsphere' }); // Geospatial queries
TerritoryControlSchema.index({ createdAt: -1 }); // Sort by creation time

// Add pagination plugin
TerritoryControlSchema.plugin(mongoosePaginate);

// Format dates to YYYY-MM-DD when converting to JSON
TerritoryControlSchema.methods.toJSON = function() {
  const territoryControl = this.toObject();
  
  // Format main date
  if (territoryControl.date) {
    territoryControl.date = territoryControl.date.toISOString().split('T')[0];
  }
  
  // Format feature controlledSince dates
  if (territoryControl.features && territoryControl.features.length > 0) {
    territoryControl.features = territoryControl.features.map(feature => {
      if (feature.properties && feature.properties.controlledSince) {
        feature.properties.controlledSince = feature.properties.controlledSince.toISOString().split('T')[0];
      }
      return feature;
    });
  }
  
  // Format metadata dates
  if (territoryControl.metadata && territoryControl.metadata.lastVerified) {
    territoryControl.metadata.lastVerified = territoryControl.metadata.lastVerified.toISOString().split('T')[0];
  }
  
  return territoryControl;
};

// Static method to find territory control for a specific date
TerritoryControlSchema.statics.findByDate = async function(targetDate, options = {}) {
  const query = { date: { $lte: new Date(targetDate) } };
  
  // Add additional filters if provided
  if (options.controlledBy) {
    query['features.properties.controlledBy'] = options.controlledBy;
  }
  
  // Find the most recent territory control data up to the target date
  const result = await this.findOne(query)
    .sort({ date: -1 })
    .populate('created_by', 'name')
    .populate('updated_by', 'name');
    
  return result;
};

// Static method to find closest territory control to a date
TerritoryControlSchema.statics.findClosestToDate = async function(targetDate) {
  const target = new Date(targetDate);
  
  // First try to find the most recent one before or on the target date
  let result = await this.findOne({ date: { $lte: target } })
    .sort({ date: -1 })
    .populate('created_by', 'name')
    .populate('updated_by', 'name');
  
  // If no result found before the date, find the earliest one after the date
  if (!result) {
    result = await this.findOne({ date: { $gt: target } })
      .sort({ date: 1 })
      .populate('created_by', 'name')
      .populate('updated_by', 'name');
  }
  
  return result;
};

// Static method to get all dates with territory control data
TerritoryControlSchema.statics.getAvailableDates = async function() {
  const dates = await this.distinct('date');
  return dates.sort((a, b) => new Date(b) - new Date(a)); // Sort by most recent first
};

// Static method to get territory control timeline
TerritoryControlSchema.statics.getTimeline = async function(options = {}) {
  const query = {};
  
  // Filter by date range if provided
  if (options.startDate || options.endDate) {
    query.date = {};
    if (options.startDate) query.date.$gte = new Date(options.startDate);
    if (options.endDate) query.date.$lte = new Date(options.endDate);
  }
  
  // Filter by controller if provided
  if (options.controlledBy) {
    query['features.properties.controlledBy'] = options.controlledBy;
  }
  
  const paginationOptions = {
    page: options.page || 1,
    limit: options.limit || 50,
    sort: options.sort || '-date',
    populate: [
      { path: 'created_by', select: 'name' },
      { path: 'updated_by', select: 'name' }
    ]
  };
  
  return await this.paginate(query, paginationOptions);
};

// Static method for comprehensive validation with business rules
TerritoryControlSchema.statics.validateForCreation = async function(territoryData, options = {}) {
  const errors = [];
  
  // Sanitize data first
  const sanitizedData = this.sanitizeData(territoryData);
  
  // Business logic validation
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

// Business rule validation
TerritoryControlSchema.statics._validateBusinessRules = async function(data, errors, options) {
  // Check for duplicate dates (unless explicitly allowing duplicates)
  if (!options.allowDuplicateDates) {
    const existingControl = await this.findOne({ 
      date: data.date,
      _id: { $ne: data._id } // Exclude current document if updating
    });
    
    if (existingControl) {
      errors.push({
        field: 'date',
        message: `Territory control data already exists for date ${data.date.toISOString().split('T')[0]}`
      });
    }
  }
  
  // Validate that all features have valid geometries
  if (data.features && data.features.length > 0) {
    data.features.forEach((feature, index) => {
      if (!feature.geometry || !feature.geometry.coordinates) {
        errors.push({
          field: `features.${index}.geometry`,
          message: `Feature ${index + 1} must have valid geometry coordinates`
        });
      }
      
      if (!feature.properties || !feature.properties.name) {
        errors.push({
          field: `features.${index}.properties.name`,
          message: `Feature ${index + 1} must have a name`
        });
      }
    });
  }
  
  // Note: Removed date consistency validation for controlledSince - now accepts any date
};

// Static method for sanitization/normalization
TerritoryControlSchema.statics.sanitizeData = function(territoryData) {
  const sanitized = JSON.parse(JSON.stringify(territoryData)); // Deep clone
  
  // Normalize main date
  if (sanitized.date) {
    sanitized.date = new Date(sanitized.date);
  }
  
  // Ensure required defaults
  if (!sanitized.type) sanitized.type = 'FeatureCollection';
  if (!sanitized.features) sanitized.features = [];
  if (!sanitized.metadata) sanitized.metadata = {};
  if (!sanitized.metadata.source) sanitized.metadata.source = 'manual_entry';
  if (!sanitized.metadata.accuracy) sanitized.metadata.accuracy = 'medium';
  if (!sanitized.metadata.lastVerified) sanitized.metadata.lastVerified = new Date();
  
  // Sanitize features
  if (sanitized.features && sanitized.features.length > 0) {
    sanitized.features = sanitized.features.map(feature => {
      // Ensure feature has proper structure
      if (!feature.type) feature.type = 'Feature';
      if (!feature.properties) feature.properties = {};
      
      // Normalize dates in feature properties
      if (feature.properties.controlledSince) {
        feature.properties.controlledSince = new Date(feature.properties.controlledSince);
      }
      
      // Ensure description has proper localized structure
      if (!feature.properties.description) {
        feature.properties.description = { en: '', ar: '' };
      } else if (typeof feature.properties.description === 'string') {
        feature.properties.description = { en: feature.properties.description, ar: '' };
      }
      
      return feature;
    });
  }
  
  // Ensure metadata description has proper localized structure
  if (!sanitized.metadata.description) {
    sanitized.metadata.description = { en: '', ar: '' };
  } else if (typeof sanitized.metadata.description === 'string') {
    sanitized.metadata.description = { en: sanitized.metadata.description, ar: '' };
  }
  
  return sanitized;
};

// Instance method to check if this territory control is current (most recent)
TerritoryControlSchema.methods.isCurrent = async function() {
  const mostRecent = await this.constructor.findOne({}).sort({ date: -1 });
  return mostRecent && mostRecent._id.equals(this._id);
};

// Instance method to get territories controlled by a specific entity
TerritoryControlSchema.methods.getTerritoriesByController = function(controlledBy) {
  return this.features.filter(feature => feature.properties.controlledBy === controlledBy);
};

// Instance method to get total area statistics (simplified - would need geospatial calculations for real area)
TerritoryControlSchema.methods.getControllerStats = function() {
  const stats = {};
  
  this.features.forEach(feature => {
    const controller = feature.properties.controlledBy;
    if (!stats[controller]) {
      stats[controller] = {
        territories: 0,
        features: []
      };
    }
    stats[controller].territories += 1;
    stats[controller].features.push({
      name: feature.properties.name,
      controlledSince: feature.properties.controlledSince
    });
  });
  
  return stats;
};

module.exports = mongoose.model('TerritoryControl', TerritoryControlSchema); 