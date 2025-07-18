const mongoose = require('mongoose');
const mongoosePaginate = require('mongoose-paginate-v2');

// Helper function to get current time (can be overridden for testing)
const getCurrentTime = () => new Date();

// Report schema for storing scraped Telegram messages
const ReportSchema = new mongoose.Schema({
  source_url: {
    type: String,
    required: [true, 'Source URL is required'],
    validate: {
      validator: function(value) {
        return /^https:\/\/t\.me\//.test(value);
      },
      message: 'Source URL must be a valid Telegram URL'
    }
  },
  text: {
    type: String,
    required: [true, 'Report text is required'],
    minlength: [10, 'Report text must be at least 10 characters'],
    maxlength: [10000, 'Report text cannot exceed 10000 characters']
  },
  date: {
    type: Date,
    required: [true, 'Report date is required'],
    validate: {
      validator: function(value) {
        // Use module.exports to get the current function reference
        const now = module.exports.getCurrentTime();
        const reportDate = new Date(value);
        // Allow reports up to 1 hour in the future to account for timezone differences
        const buffer = 60 * 60 * 1000; // 1 hour in milliseconds
        const maxAllowedDate = new Date(now.getTime() + buffer);
        return reportDate <= maxAllowedDate;
      },
      message: 'Report date cannot be more than 1 hour in the future'
    }
  },
  parsedByLLM: {
    type: Boolean,
    default: false,
    required: [true, 'ParsedByLLM flag is required']
  },
  metadata: {
    channel: {
      type: String,
      required: [true, 'Channel name is required']
    },
    messageId: {
      type: String,
      required: [true, 'Message ID is required']
    },
    scrapedAt: {
      type: Date,
      default: Date.now,
      required: [true, 'Scraped timestamp is required']
    },
    matchedKeywords: {
      type: [String],
      default: []
    },
    language: {
      type: String,
      enum: ['ar', 'en', 'mixed', 'unknown'],
      default: 'unknown'
    },
    mediaCount: {
      type: Number,
      min: 0,
      default: 0
    },
    forwardedFrom: {
      type: String,
      default: null
    },
    viewCount: {
      type: Number,
      min: 0,
      default: 0
    }
  },
  // Reference to parsing job if this report has been processed
  parsingJobId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ReportParsingJob',
    default: null
  },
  // Status tracking - Updated with new states
  status: {
    type: String,
    enum: ['unprocessed', 'processing', 'processed', 'failed', 'ignored', 'retry_pending'],
    default: 'unprocessed'
  },
  // Error information if processing failed
  error: {
    type: String,
    default: null
  },
  // Array of created violation IDs
  violation_ids: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Violation'
  }],
  // Processing metadata for retry logic and performance tracking
  processing_metadata: {
    attempts: {
      type: Number,
      default: 0,
      min: 0,
      max: 3
    },
    last_attempt: {
      type: Date,
      default: null
    },
    processing_time_ms: {
      type: Number,
      default: null,
      min: 0
    },
    violations_created: {
      type: Number,
      default: 0,
      min: 0
    },
    error_details: {
      type: String,
      default: null
    },
    started_at: {
      type: Date,
      default: null
    }
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Create indexes for efficient querying
ReportSchema.index({ 'metadata.channel': 1, date: -1 });
ReportSchema.index({ parsedByLLM: 1, status: 1 });
ReportSchema.index({ source_url: 1 }, { unique: true });
ReportSchema.index({ 'metadata.scrapedAt': -1 });
ReportSchema.index({ 'metadata.messageId': 1, 'metadata.channel': 1 }, { unique: true });

// New indexes for batch processing
ReportSchema.index({ 
  status: 1, 
  'processing_metadata.attempts': 1, 
  'metadata.scrapedAt': -1 
});
ReportSchema.index({ violation_ids: 1 });
ReportSchema.index({ 'processing_metadata.last_attempt': 1 });

// Add pagination plugin
ReportSchema.plugin(mongoosePaginate);

// Format dates when converting to JSON
ReportSchema.methods.toJSON = function() {
  const report = this.toObject();
  
  // Format date to ISO string
  if (report.date) {
    report.date = report.date.toISOString();
  }
  
  if (report.metadata && report.metadata.scrapedAt) {
    report.metadata.scrapedAt = report.metadata.scrapedAt.toISOString();
  }
  
  return report;
};

// Static method to find reports ready for LLM processing with retry logic
ReportSchema.statics.findReadyForProcessing = function(limit = 15) {
  const now = new Date();
  const thirtyMinutesAgo = new Date(now.getTime() - 30 * 60 * 1000); // 30 minutes ago
  const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000); // 5 minutes ago for stuck processing

  return this.find({
    $or: [
      // Fresh unprocessed reports
      { 
        status: 'unprocessed',
        'processing_metadata.attempts': { $lt: 3 }
      },
      // Retry pending reports where enough time has passed
      { 
        status: 'retry_pending',
        'processing_metadata.attempts': { $lt: 3 },
        'processing_metadata.last_attempt': { $lte: thirtyMinutesAgo }
      },
      // Stuck processing reports (processing for more than 5 minutes)
      { 
        status: 'processing',
        'processing_metadata.started_at': { $lte: fiveMinutesAgo }
      }
    ],
    parsedByLLM: false
  })
    .sort({ 'metadata.scrapedAt': -1 })
    .limit(limit);
};

// Static method to find recent reports by channel
ReportSchema.statics.findRecentByChannel = function(channel, hours = 24) {
  const startDate = new Date(Date.now() - (hours * 60 * 60 * 1000));
  return this.find({
    'metadata.channel': channel,
    'metadata.scrapedAt': { $gte: startDate }
  })
    .sort({ 'metadata.scrapedAt': -1 });
};

// Static method to check if a report already exists
ReportSchema.statics.exists = function(channel, messageId) {
  return this.findOne({
    'metadata.channel': channel,
    'metadata.messageId': messageId
  });
};

// Static method for sanitization/normalization
ReportSchema.statics.sanitizeData = function(reportData) {
  const sanitized = JSON.parse(JSON.stringify(reportData)); // Deep clone
  
  // Normalize dates
  if (sanitized.date) {
    if (typeof sanitized.date === 'string') {
      sanitized.date = new Date(sanitized.date);
    }
  }
  
  // Ensure required defaults
  if (sanitized.parsedByLLM === undefined) sanitized.parsedByLLM = false;
  if (!sanitized.status) sanitized.status = 'unprocessed';
  if (!sanitized.metadata) sanitized.metadata = {};
  if (!sanitized.metadata.matchedKeywords) sanitized.metadata.matchedKeywords = [];
  if (sanitized.metadata.mediaCount === undefined) sanitized.metadata.mediaCount = 0;
  if (sanitized.metadata.viewCount === undefined) sanitized.metadata.viewCount = 0;
  if (!sanitized.metadata.language) sanitized.metadata.language = 'unknown';
  
  // Initialize processing metadata if not present
  if (!sanitized.processing_metadata) {
    sanitized.processing_metadata = {
      attempts: 0,
      last_attempt: null,
      processing_time_ms: null,
      violations_created: 0,
      error_details: null,
      started_at: null
    };
  }
  
  // Initialize violation_ids if not present
  if (!sanitized.violation_ids) {
    sanitized.violation_ids = [];
  }
  
  return sanitized;
};

// Instance method to mark as processing
ReportSchema.methods.markAsProcessing = function() {
  this.status = 'processing';
  this.processing_metadata.attempts = (this.processing_metadata.attempts || 0) + 1;
  this.processing_metadata.started_at = new Date();
  this.processing_metadata.last_attempt = new Date();
  return this.save();
};

// Instance method to mark as processed
ReportSchema.methods.markAsProcessed = function(violationIds, processingTimeMs) {
  this.status = 'processed';
  this.parsedByLLM = true;
  this.violation_ids = violationIds || [];
  this.processing_metadata.violations_created = violationIds ? violationIds.length : 0;
  this.processing_metadata.processing_time_ms = processingTimeMs || null;
  this.processing_metadata.started_at = null;
  this.error = null;
  return this.save();
};

// Instance method to mark as failed
ReportSchema.methods.markAsFailed = function(errorMessage) {
  const maxAttempts = 3;
  const currentAttempts = this.processing_metadata.attempts || 0;
  
  if (currentAttempts >= maxAttempts) {
    this.status = 'failed';
  } else {
    this.status = 'retry_pending';
  }
  
  this.error = errorMessage;
  this.processing_metadata.error_details = errorMessage;
  this.processing_metadata.started_at = null;
  return this.save();
};

// Instance method to mark as ignored
ReportSchema.methods.markAsIgnored = function(reason) {
  this.status = 'ignored';
  this.error = reason;
  this.processing_metadata.error_details = reason;
  this.processing_metadata.started_at = null;
  return this.save();
};

// Instance method to extract keywords from text
ReportSchema.methods.extractKeywords = function(keywordsList) {
  const text = this.text.toLowerCase();
  const matchedKeywords = [];
  
  keywordsList.forEach(keyword => {
    if (text.includes(keyword.toLowerCase())) {
      matchedKeywords.push(keyword);
    }
  });
  
  this.metadata.matchedKeywords = matchedKeywords;
  return matchedKeywords;
};

// Static method to get regional filtering statistics
ReportSchema.statics.getRegionalFilteringStats = function(hoursBack = 24) {
  const startDate = new Date(Date.now() - hoursBack * 60 * 60 * 1000);
  
  return this.aggregate([
    {
      $match: {
        'metadata.scrapedAt': { $gte: startDate }
      }
    },
    {
      $group: {
        _id: '$metadata.channel',
        totalReports: { $sum: 1 },
        regionFiltered: {
          $sum: {
            $cond: [
              { $regexMatch: { input: '$error', regex: /No assigned region found/i } },
              1,
              0
            ]
          }
        }
      }
    }
  ]);
};

const Report = mongoose.model('Report', ReportSchema);

// Export the model and helper functions for testing
module.exports = Report;

// Export helper function for testing purposes
module.exports.getCurrentTime = getCurrentTime;

// Allow overriding the getCurrentTime function for testing
module.exports.setCurrentTimeProvider = (provider) => {
  module.exports.getCurrentTime = provider;
};