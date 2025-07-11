const mongoose = require('mongoose');

// Schema for Claude batch processing
const ClaudeBatchSchema = new mongoose.Schema({
  batchId: {
    type: String,
    required: [true, 'Claude batch ID is required'],
    unique: true,
    index: true
  },
  status: {
    type: String,
    enum: ['pending', 'submitted', 'processing', 'completed', 'failed', 'expired', 'cancelled'],
    default: 'pending',
    index: true
  },
  requests: [{
    customId: {
      type: String,
      required: true
    },
    jobId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ReportParsingJob',
      required: true
    },
    inputTokens: {
      type: Number,
      default: 0
    },
    outputTokens: {
      type: Number,
      default: 0
    }
  }],
  claudeStatus: {
    type: String,
    enum: ['in_progress', 'validating', 'completed', 'failed', 'expired', 'cancelled'],
    default: 'in_progress'
  },
  requestCounts: {
    processing: {
      type: Number,
      default: 0
    },
    succeeded: {
      type: Number,
      default: 0
    },
    errored: {
      type: Number,
      default: 0
    },
    canceled: {
      type: Number,
      default: 0
    },
    expired: {
      type: Number,
      default: 0
    }
  },
  submittedAt: {
    type: Date,
    default: Date.now
  },
  completedAt: {
    type: Date,
    required: false
  },
  expiresAt: {
    type: Date,
    required: false
  },
  resultsUrl: {
    type: String,
    required: false
  },
  metadata: {
    model: {
      type: String,
      required: true
    },
    maxTokens: {
      type: Number,
      required: true
    },
    totalInputTokens: {
      type: Number,
      default: 0
    },
    totalOutputTokens: {
      type: Number,
      default: 0
    },
    costSavings: {
      regularInputCost: {
        type: Number,
        default: 0
      },
      regularOutputCost: {
        type: Number,
        default: 0
      },
      batchInputCost: {
        type: Number,
        default: 0
      },
      batchOutputCost: {
        type: Number,
        default: 0
      },
      totalSavings: {
        type: Number,
        default: 0
      },
      percentSaved: {
        type: Number,
        default: 0
      }
    }
  },
  errorDetails: [{
    requestId: String,
    customId: String,
    error: String,
    timestamp: {
      type: Date,
      default: Date.now
    }
  }]
}, {
  timestamps: true,
  suppressReservedKeysWarning: true
});

// Indexes for efficient queries
ClaudeBatchSchema.index({ status: 1, submittedAt: -1 });
ClaudeBatchSchema.index({ claudeStatus: 1, submittedAt: -1 });
ClaudeBatchSchema.index({ expiresAt: 1 });
ClaudeBatchSchema.index({ 'requests.jobId': 1 });

// Instance methods
ClaudeBatchSchema.methods.calculateCostSavings = function() {
  const inputTokens = this.metadata.totalInputTokens;
  const outputTokens = this.metadata.totalOutputTokens;
  
  // Claude pricing (per million tokens)
  const REGULAR_INPUT_COST = 3.00;
  const REGULAR_OUTPUT_COST = 15.00;
  const BATCH_INPUT_COST = 1.50;
  const BATCH_OUTPUT_COST = 7.50;
  
  const regularInputCost = (inputTokens / 1000000) * REGULAR_INPUT_COST;
  const regularOutputCost = (outputTokens / 1000000) * REGULAR_OUTPUT_COST;
  const batchInputCost = (inputTokens / 1000000) * BATCH_INPUT_COST;
  const batchOutputCost = (outputTokens / 1000000) * BATCH_OUTPUT_COST;
  
  const totalRegularCost = regularInputCost + regularOutputCost;
  const totalBatchCost = batchInputCost + batchOutputCost;
  const totalSavings = totalRegularCost - totalBatchCost;
  const percentSaved = totalRegularCost > 0 ? (totalSavings / totalRegularCost) * 100 : 0;
  
  this.metadata.costSavings = {
    regularInputCost,
    regularOutputCost,
    batchInputCost,
    batchOutputCost,
    totalSavings,
    percentSaved
  };
  
  return this.metadata.costSavings;
};

ClaudeBatchSchema.methods.updateTokenCounts = function() {
  this.metadata.totalInputTokens = this.requests.reduce((sum, req) => sum + req.inputTokens, 0);
  this.metadata.totalOutputTokens = this.requests.reduce((sum, req) => sum + req.outputTokens, 0);
  return this;
};

ClaudeBatchSchema.methods.addRequest = function(customId, jobId, inputTokens = 0) {
  this.requests.push({
    customId,
    jobId,
    inputTokens,
    outputTokens: 0
  });
  this.updateTokenCounts();
  return this;
};

ClaudeBatchSchema.methods.updateRequestTokens = function(customId, inputTokens, outputTokens) {
  const request = this.requests.find(req => req.customId === customId);
  if (request) {
    request.inputTokens = inputTokens;
    request.outputTokens = outputTokens;
    this.updateTokenCounts();
  }
  return this;
};

ClaudeBatchSchema.methods.addError = function(requestId, customId, error) {
  this.errorDetails.push({
    requestId,
    customId,
    error,
    timestamp: new Date()
  });
  return this;
};

ClaudeBatchSchema.methods.isExpired = function() {
  if (!this.expiresAt) {
    return false;
  }
  return new Date() > this.expiresAt;
};

ClaudeBatchSchema.methods.getProgress = function() {
  const total = this.requests.length;
  const completed = this.requestCounts.succeeded + this.requestCounts.errored;
  return {
    total,
    completed,
    percentage: total > 0 ? (completed / total) * 100 : 0,
    processing: this.requestCounts.processing,
    succeeded: this.requestCounts.succeeded,
    errored: this.requestCounts.errored,
    canceled: this.requestCounts.canceled,
    expired: this.requestCounts.expired
  };
};

// Static methods
ClaudeBatchSchema.statics.findActiveBatches = function() {
  return this.find({
    status: { $in: ['submitted', 'processing'] },
    claudeStatus: { $in: ['in_progress'] },
    $or: [
      { expiresAt: { $exists: false } },
      { expiresAt: null },
      { expiresAt: { $gt: new Date() } }
    ]
  });
};

ClaudeBatchSchema.statics.findExpiredBatches = function() {
  return this.find({
    expiresAt: { $lt: new Date() },
    status: { $in: ['submitted', 'processing'] }
  });
};

ClaudeBatchSchema.statics.getBatchStats = function(dateRange) {
  const matchCriteria = {};
  
  if (dateRange) {
    matchCriteria.submittedAt = dateRange;
  }
  
  return this.aggregate([
    { $match: matchCriteria },
    {
      $group: {
        _id: null,
        totalBatches: { $sum: 1 },
        completedBatches: {
          $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] }
        },
        totalJobs: { $sum: { $size: '$requests' } },
        totalInputTokens: { $sum: '$metadata.totalInputTokens' },
        totalOutputTokens: { $sum: '$metadata.totalOutputTokens' },
        totalSavings: { $sum: '$metadata.costSavings.totalSavings' },
        avgBatchSize: { $avg: { $size: '$requests' } }
      }
    }
  ]);
};

module.exports = mongoose.model('ClaudeBatch', ClaudeBatchSchema);