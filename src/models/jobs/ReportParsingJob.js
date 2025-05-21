const mongoose = require('mongoose');

// Schema for report parsing job
const ReportParsingJobSchema = new mongoose.Schema({
  reportText: {
    type: String,
    required: [true, 'Report text is required']
  },
  sourceURL: {
    name: {
      type: String,
      required: [true, 'Source name is required']
    },
    url: {
      type: String,
      required: false,
      validate: {
        validator: function(value) {
          if (!value) return true;
          return /^(https?:\/\/)?([a-z0-9.-]+)\.([a-z.]{2,6})([/\w .-]*)*\/?$/.test(value);
        },
        message: 'Source URL must be a valid URL'
      }
    },
    reportDate: {
      type: String,
      required: false
    }
  },
  submittedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  status: {
    type: String,
    enum: ['queued', 'processing', 'validation', 'creating_violations', 'completed', 'failed'],
    default: 'queued'
  },
  progress: {
    type: Number,
    min: 0,
    max: 100,
    default: 0
  },
  estimatedProcessingTime: {
    type: String, 
    default: 'unknown'
  },
  error: {
    type: String,
    required: false
  },
  results: {
    parsedViolationsCount: {
      type: Number,
      default: 0
    },
    createdViolationsCount: {
      type: Number,
      default: 0
    },
    violations: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Violation'
      }
    ],
    failedViolations: [
      {
        violation: {
          type: Object
        },
        error: {
          type: String
        }
      }
    ]
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('ReportParsingJob', ReportParsingJobSchema);