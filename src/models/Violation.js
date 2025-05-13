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
    type: LocalizedStringSchema,
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

module.exports = mongoose.model('Violation', ViolationSchema);