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
  OTHER: 'OTHER'
};

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
    type: String,
    maxlength: [100, 'Group affiliation cannot be more than 100 characters']
  },
  sectarian_identity: {
    type: String,
    maxlength: [50, 'Sectarian identity cannot be more than 50 characters']
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
    required: true,
    validate: {
      validator: function(val) {
        return val.length === 2 && 
               val[0] >= -180 && val[0] <= 180 &&
               val[1] >= -90 && val[1] <= 90;
      },
      message: 'Coordinates must be [longitude, latitude] format with valid ranges'
    }
  },
  name: {
    type: String,
    required: [true, 'Location name is required'],
    trim: true,
    minlength: [2, 'Location name must be at least 2 characters'],
    maxlength: [100, 'Location name cannot be more than 100 characters']
  },
  administrative_division: {
    type: String,
    trim: true,
    maxlength: [100, 'Administrative division cannot be more than 100 characters']
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
        return !value || value <= new Date();
      },
      message: 'Reported date cannot be in the future'
    }
  },
  location: {
    type: LocationSchema,
    required: [true, 'Location information is required']
  },
  description: {
    type: String,
    required: [true, 'Description is required'],
    trim: true,
    minlength: [10, 'Description must be at least 10 characters'],
    maxlength: [2000, 'Description cannot be more than 2000 characters']
  },
  source: {
    type: String,
    trim: true,
    maxlength: [200, 'Source cannot be more than 200 characters']
  },
  source_url: {
    type: String,
    trim: true,
    validate: {
      validator: function(v) {
        return !v || /^(https?:\/\/)?([\da-z\.-]+)\.([a-z\.]{2,6})([\/\w \.-]*)*\/?$/.test(v);
      },
      message: props => `${props.value} is not a valid URL`
    },
    maxlength: [500, 'Source URL cannot be more than 500 characters']
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
    type: String,
    trim: true,
    maxlength: [500, 'Verification method cannot be more than 500 characters']
  },
  casualties: {
    type: Number,
    min: [0, 'Casualties cannot be negative'],
    default: 0
  },
  victims: {
    type: [VictimSchema],
    default: []
  },
  perpetrator: {
    type: String,
    trim: true,
    maxlength: [200, 'Perpetrator cannot be more than 200 characters']
  },
  perpetrator_affiliation: {
    type: String,
    trim: true,
    maxlength: [100, 'Perpetrator affiliation cannot be more than 100 characters']
  },
  media_links: {
    type: [String],
    validate: {
      validator: function(v) {
        if (!v) return true;
        return v.every(url => /^(https?:\/\/)?([\da-z\.-]+)\.([a-z\.]{2,6})([\/\w \.-]*)*\/?$/.test(url));
      },
      message: 'One or more media links are invalid URLs'
    }
  },
  tags: {
    type: [String],
    validate: {
      validator: function(v) {
        return !v || v.every(tag => tag.length <= 50);
      },
      message: 'Tags cannot be more than 50 characters each'
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

module.exports = mongoose.model('Violation', ViolationSchema);