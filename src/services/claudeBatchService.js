const axios = require('axios');
const logger = require('../config/logger');
const parseInstructions = require('../config/parseInstructions');
const ClaudeBatch = require('../models/jobs/ClaudeBatch');
const ReportParsingJob = require('../models/jobs/ReportParsingJob');
const textPreprocessor = require('../utils/textPreprocessor');
const { v4: uuidv4 } = require('uuid');

/**
 * Service for managing Claude batch processing operations
 */
class ClaudeBatchService {
  constructor() {
    this.apiKey = process.env.CLAUDE_API_KEY;
    this.apiEndpoint = process.env.CLAUDE_API_ENDPOINT || 'https://api.anthropic.com/v1/messages';
    this.batchEndpoint = 'https://api.anthropic.com/v1/messages/batches';
    this.model = process.env.CLAUDE_MODEL || 'claude-3-5-sonnet-20241022';
    this.maxTokens = parseInt(process.env.CLAUDE_MAX_TOKENS) || 4096;
    this.maxBatchSize = parseInt(process.env.CLAUDE_MAX_BATCH_SIZE) || 50;
    this.maxBatchSizeMB = parseInt(process.env.CLAUDE_MAX_BATCH_SIZE_MB) || 200; // Conservative limit
  }

  /**
   * Submit a batch of jobs to Claude API
   * @param {Array} jobs - Array of ReportParsingJob documents
   * @returns {Promise<ClaudeBatch>} - Created batch document
   */
  async submitBatch(jobs) {
    try {
      if (!jobs || jobs.length === 0) {
        throw new Error('No jobs provided for batch submission');
      }

      if (!this.apiKey) {
        throw new Error('Claude API key is not configured');
      }

      logger.info(`Preparing to submit batch with ${jobs.length} jobs`);

      // Validate and build batch requests
      const { requests, validJobs, skippedJobs } = await this.buildBatchRequests(jobs);

      if (requests.length === 0) {
        logger.warn('No valid requests after preprocessing, skipping batch submission');
        return null;
      }

      // Estimate batch size
      const batchSizeEstimate = this.estimateBatchSize(requests);
      if (batchSizeEstimate > this.maxBatchSizeMB * 1024 * 1024) {
        throw new Error(`Batch size (${Math.round(batchSizeEstimate / 1024 / 1024)}MB) exceeds limit (${this.maxBatchSizeMB}MB)`);
      }

      logger.info(`Submitting batch with ${requests.length} requests (estimated ${Math.round(batchSizeEstimate / 1024)}KB)`);

      // Submit to Claude API
      const response = await axios.post(this.batchEndpoint, 
        { requests },
        {
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': this.apiKey,
            'anthropic-version': '2023-06-01'
          },
          timeout: 60000 // 1 minute timeout for batch submission
        }
      );

      const batchData = response.data;
      logger.info(`Claude API batch created: ${batchData.id}`);

      // Create batch document in database
      const claudeBatch = await this.createBatchDocument(batchData, validJobs, requests);

      // Update job statuses
      await this.updateJobsForBatch(validJobs, claudeBatch);

      // Handle skipped jobs
      if (skippedJobs.length > 0) {
        await this.handleSkippedJobs(skippedJobs);
      }

      logger.info(`Batch ${batchData.id} submitted successfully with ${validJobs.length} jobs (${skippedJobs.length} skipped)`);
      return claudeBatch;

    } catch (error) {
      logger.error('Failed to submit batch:', error);
      
      // Fallback all jobs to individual processing
      if (jobs && jobs.length > 0) {
        await this.fallbackJobsToIndividual(jobs, error.message);
      }
      
      throw error;
    }
  }

  /**
   * Build batch requests from jobs, applying preprocessing
   * @param {Array} jobs - Array of job documents
   * @returns {Promise<Object>} - Object with requests, validJobs, and skippedJobs arrays
   */
  async buildBatchRequests(jobs) {
    const requests = [];
    const validJobs = [];
    const skippedJobs = [];

    for (const job of jobs) {
      try {
        // Apply preprocessing
        const preprocessingResult = textPreprocessor.shouldProcessWithClaude(job.reportText);
        
        if (!preprocessingResult.shouldProcess) {
          // Mark job as skipped due to preprocessing
          skippedJobs.push({
            job,
            reason: `Preprocessing filter: ${preprocessingResult.reason}`,
            preprocessingResult
          });
          continue;
        }

        // Build source information
        const sourceInfo = this.buildSourceInfo(job.sourceURL);

        // Estimate token count for this request
        const estimatedTokens = this.estimateTokenCount(job.reportText + sourceInfo);
        
        // Create request
        const request = {
          custom_id: `job_${job._id}`,
          params: {
            model: this.model,
            max_tokens: this.maxTokens,
            system: parseInstructions.SYSTEM_PROMPT,
            messages: [
              {
                role: 'user',
                content: `${parseInstructions.USER_PROMPT}\n\nSOURCE INFO: ${sourceInfo}\n\nREPORT TEXT:\n${job.reportText}`
              }
            ]
          }
        };

        requests.push(request);
        validJobs.push({
          job,
          estimatedInputTokens: estimatedTokens,
          preprocessingResult
        });

      } catch (error) {
        logger.error(`Error processing job ${job._id} for batch:`, error);
        skippedJobs.push({
          job,
          reason: `Processing error: ${error.message}`,
          error
        });
      }
    }

    return { requests, validJobs, skippedJobs };
  }

  /**
   * Create batch document in database
   * @param {Object} batchData - Response from Claude API
   * @param {Array} validJobs - Array of valid job objects
   * @param {Array} requests - Array of batch requests
   * @returns {Promise<ClaudeBatch>} - Created batch document
   */
  async createBatchDocument(batchData, validJobs, requests) {
    const batchRequests = validJobs.map((jobObj, index) => ({
      customId: requests[index].custom_id,
      jobId: jobObj.job._id,
      inputTokens: jobObj.estimatedInputTokens || 0,
      outputTokens: 0 // Will be updated when results are processed
    }));

    const claudeBatch = await ClaudeBatch.create({
      batchId: batchData.id,
      status: 'submitted',
      requests: batchRequests,
      claudeStatus: batchData.processing_status || 'in_progress',
      requestCounts: batchData.request_counts || {
        processing: batchRequests.length,
        succeeded: 0,
        errored: 0,
        canceled: 0,
        expired: 0
      },
      submittedAt: new Date(),
      expiresAt: batchData.expires_at ? new Date(batchData.expires_at) : new Date(Date.now() + 24 * 60 * 60 * 1000),
      metadata: {
        model: this.model,
        maxTokens: this.maxTokens,
        totalInputTokens: batchRequests.reduce((sum, req) => sum + req.inputTokens, 0),
        totalOutputTokens: 0
      }
    });

    // Calculate initial cost savings
    claudeBatch.calculateCostSavings();
    await claudeBatch.save();

    return claudeBatch;
  }

  /**
   * Update job statuses for batch submission
   * @param {Array} validJobs - Array of valid job objects
   * @param {ClaudeBatch} claudeBatch - Created batch document
   */
  async updateJobsForBatch(validJobs, claudeBatch) {
    const updatePromises = validJobs.map(async (jobObj) => {
      const job = jobObj.job;
      const customId = `job_${job._id}`;
      
      await job.markAsBatched(claudeBatch._id, customId);
      await job.markAsBatchSubmitted();
      
      // Store preprocessing result
      if (jobObj.preprocessingResult) {
        job.results.preprocessingResult = jobObj.preprocessingResult;
        await job.save();
      }
    });

    await Promise.all(updatePromises);
  }

  /**
   * Handle jobs that were skipped during batch creation
   * @param {Array} skippedJobs - Array of skipped job objects
   */
  async handleSkippedJobs(skippedJobs) {
    const handlePromises = skippedJobs.map(async (skippedObj) => {
      const { job, reason, preprocessingResult } = skippedObj;
      
      if (reason.includes('Preprocessing filter')) {
        // Mark as completed with no violations due to preprocessing
        await ReportParsingJob.findByIdAndUpdate(job._id, {
          status: 'completed',
          progress: 100,
          error: reason,
          'results.parsedViolationsCount': 0,
          'results.createdViolationsCount': 0,
          'results.violations': [],
          'results.failedViolations': [],
          'results.preprocessingResult': preprocessingResult
        });
        
        logger.info(`Job ${job._id} completed with preprocessing filter: ${reason}`);
      } else {
        // Fallback to individual processing for other errors
        await job.fallbackToIndividual();
        logger.info(`Job ${job._id} fell back to individual processing: ${reason}`);
      }
    });

    await Promise.all(handlePromises);
  }

  /**
   * Fallback jobs to individual processing
   * @param {Array} jobs - Array of job documents
   * @param {string} reason - Reason for fallback
   */
  async fallbackJobsToIndividual(jobs, reason) {
    const fallbackPromises = jobs.map(async (job) => {
      try {
        await job.fallbackToIndividual();
        logger.info(`Job ${job._id} fell back to individual processing: ${reason}`);
      } catch (error) {
        logger.error(`Failed to fallback job ${job._id}:`, error);
      }
    });

    await Promise.all(fallbackPromises);
  }

  /**
   * Build source information string
   * @param {Object} sourceURL - Source URL object from job
   * @returns {string} - Formatted source information
   */
  buildSourceInfo(sourceURL) {
    if (!sourceURL || !sourceURL.name) {
      return 'No source information provided';
    }

    let sourceInfo = `Report source: ${sourceURL.name}`;
    
    if (sourceURL.url) {
      sourceInfo += ` (${sourceURL.url})`;
    }
    
    if (sourceURL.reportDate) {
      sourceInfo += ` published on ${sourceURL.reportDate}`;
    }

    return sourceInfo;
  }

  /**
   * Estimate token count for text (rough approximation)
   * @param {string} text - Text to estimate
   * @returns {number} - Estimated token count
   */
  estimateTokenCount(text) {
    // Rough approximation: 1 token = ~0.75 words = ~4 characters
    return Math.ceil(text.length / 4);
  }

  /**
   * Estimate batch size in bytes
   * @param {Array} requests - Array of batch requests
   * @returns {number} - Estimated size in bytes
   */
  estimateBatchSize(requests) {
    return JSON.stringify(requests).length;
  }

  /**
   * Check if batch processing is properly configured
   * @returns {boolean} - True if configured properly
   */
  isConfigured() {
    return !!(this.apiKey && this.apiEndpoint && this.batchEndpoint);
  }

  /**
   * Get batch processing configuration
   * @returns {Object} - Configuration object
   */
  getConfig() {
    return {
      model: this.model,
      maxTokens: this.maxTokens,
      maxBatchSize: this.maxBatchSize,
      maxBatchSizeMB: this.maxBatchSizeMB,
      isConfigured: this.isConfigured()
    };
  }
}

module.exports = new ClaudeBatchService();