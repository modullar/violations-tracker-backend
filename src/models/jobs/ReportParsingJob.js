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
    enum: [
      'queued', 'processing', 'validation', 'creating_violations', 'completed', 'failed',
      'batched', 'batch_submitted', 'batch_processing', 'batch_completed'
    ],
    default: 'queued',
    index: true
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
  urgent: {
    type: Boolean,
    default: false
  },
  priority: {
    type: String,
    enum: ['low', 'normal', 'high', 'urgent'],
    default: 'normal'
  },
  processingMetadata: {
    attempts: {
      type: Number,
      default: 0
    },
    lastAttempt: {
      type: Date,
      required: false
    },
    processingStartedAt: {
      type: Date,
      required: false
    },
    processingCompletedAt: {
      type: Date,
      required: false
    },
    processingTimeMs: {
      type: Number,
      required: false
    }
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
    ],
    preprocessingResult: {
      type: Object,
      required: false
    }
  },
  // New batch-related fields
  batchInfo: {
    batchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ClaudeBatch',
      required: false,
      index: true
    },
    customId: {
      type: String,
      required: false
    },
    batchSubmittedAt: {
      type: Date,
      required: false
    },
    batchCompletedAt: {
      type: Date,
      required: false
    },
    processingMode: {
      type: String,
      enum: ['individual', 'batch'],
      default: 'individual',
      index: true
    },
    inputTokens: {
      type: Number,
      default: 0
    },
    outputTokens: {
      type: Number,
      default: 0
    }
  }
}, {
  timestamps: true
});

// Indexes for efficient queries
ReportParsingJobSchema.index({ status: 1, createdAt: -1 });
ReportParsingJobSchema.index({ 'batchInfo.processingMode': 1, status: 1 });
ReportParsingJobSchema.index({ urgent: 1, priority: 1, createdAt: -1 });
ReportParsingJobSchema.index({ submittedBy: 1, status: 1 });

// Instance methods
ReportParsingJobSchema.methods.markAsBatched = function(batchId, customId) {
  this.status = 'batched';
  this.batchInfo.processingMode = 'batch';
  this.batchInfo.batchId = batchId;
  this.batchInfo.customId = customId;
  this.batchInfo.batchSubmittedAt = new Date();
  this.processingMetadata.attempts++;
  this.processingMetadata.lastAttempt = new Date();
  return this.save();
};

ReportParsingJobSchema.methods.markAsBatchSubmitted = function() {
  this.status = 'batch_submitted';
  return this.save();
};

ReportParsingJobSchema.methods.markAsBatchCompleted = function() {
  this.status = 'batch_completed';
  this.batchInfo.batchCompletedAt = new Date();
  this.processingMetadata.processingCompletedAt = new Date();
  
  if (this.processingMetadata.processingStartedAt) {
    this.processingMetadata.processingTimeMs = 
      this.processingMetadata.processingCompletedAt - this.processingMetadata.processingStartedAt;
  }
  
  return this.save();
};

ReportParsingJobSchema.methods.fallbackToIndividual = function() {
  this.status = 'queued';
  this.batchInfo.processingMode = 'individual';
  this.batchInfo.batchId = null;
  this.batchInfo.customId = null;
  this.processingMetadata.attempts = 0;
  this.processingMetadata.lastAttempt = null;
  return this.save();
};

ReportParsingJobSchema.methods.shouldBeBatched = function() {
  // Don't batch urgent jobs
  if (this.urgent || this.priority === 'urgent') {
    return false;
  }
  
  // Don't batch very large reports (might hit batch size limits)
  if (this.reportText.length > 100000) {
    return false;
  }
  
  // Don't batch if explicitly set to individual processing and has been attempted
  if (this.batchInfo.processingMode === 'individual' && this.processingMetadata.attempts > 0) {
    return false;
  }
  
  return true;
};

// Static methods
ReportParsingJobSchema.statics.findBatchedJobs = function(limit = 25) {
  return this.find({
    status: 'batched',
    'batchInfo.processingMode': 'batch'
  }).sort({ createdAt: 1 }).limit(limit);
};

ReportParsingJobSchema.statics.findJobsInBatch = function(batchId) {
  return this.find({ 'batchInfo.batchId': batchId });
};

module.exports = mongoose.model('ReportParsingJob', ReportParsingJobSchema);