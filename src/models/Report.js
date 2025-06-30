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
  // Status tracking
  status: {
    type: String,
    enum: ['new', 'processing', 'parsed', 'failed', 'ignored'],
    default: 'new'
  },
  // Error information if processing failed
  error: {
    type: String,
    default: null
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

// Static method to find reports ready for LLM processing
ReportSchema.statics.findReadyForProcessing = function(limit = 10) {
  return this.find({
    parsedByLLM: false,
    status: 'new'
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
  if (!sanitized.status) sanitized.status = 'new';
  if (!sanitized.metadata) sanitized.metadata = {};
  if (!sanitized.metadata.matchedKeywords) sanitized.metadata.matchedKeywords = [];
  if (sanitized.metadata.mediaCount === undefined) sanitized.metadata.mediaCount = 0;
  if (sanitized.metadata.viewCount === undefined) sanitized.metadata.viewCount = 0;
  if (!sanitized.metadata.language) sanitized.metadata.language = 'unknown';
  
  return sanitized;
};

// Instance method to mark as processed
ReportSchema.methods.markAsProcessed = function(jobId) {
  this.parsedByLLM = true;
  this.status = 'parsed';
  this.parsingJobId = jobId;
  return this.save();
};

// Instance method to mark as failed
ReportSchema.methods.markAsFailed = function(errorMessage) {
  this.status = 'failed';
  this.error = errorMessage;
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

const Report = mongoose.model('Report', ReportSchema);

// Export the model and helper functions for testing
module.exports = Report;

// Export helper function for testing purposes
module.exports.getCurrentTime = getCurrentTime;

// Allow overriding the getCurrentTime function for testing
module.exports.setCurrentTimeProvider = (provider) => {
  module.exports.getCurrentTime = provider;
};