const logger = require('../config/logger');
const ReportParsingJob = require('../models/jobs/ReportParsingJob');
const claudeBatchService = require('./claudeBatchService');

/**
 * Service for accumulating jobs and triggering batch submissions
 */
class BatchAccumulator {
  constructor() {
    // Configuration from environment variables
    this.batchSize = parseInt(process.env.BATCH_SIZE) || 25; // Conservative default
    this.maxWaitTime = parseInt(process.env.BATCH_MAX_WAIT_MS) || 300000; // 5 minutes
    this.minBatchSize = parseInt(process.env.BATCH_MIN_SIZE) || 5; // Minimum jobs to trigger batch
    this.maxBatchAge = parseInt(process.env.BATCH_MAX_AGE_MS) || 600000; // 10 minutes max age
    
    // Internal state
    this.accumulationTimer = null;
    this.isAccumulating = false;
    this.lastBatchTime = Date.now();
    this.batchingEnabled = process.env.ENABLE_BATCH_PROCESSING === 'true';
    
    // Statistics
    this.stats = {
      batchesSubmitted: 0,
      jobsProcessed: 0,
      fallbacksTriggered: 0,
      lastBatchSize: 0,
      averageBatchSize: 0
    };

    if (this.batchingEnabled) {
      logger.info('BatchAccumulator initialized with batching enabled', {
        batchSize: this.batchSize,
        maxWaitTime: this.maxWaitTime,
        minBatchSize: this.minBatchSize
      });
    } else {
      logger.info('BatchAccumulator initialized with batching disabled');
    }
  }

  /**
   * Add a job to the batch accumulation process
   * @param {string|ObjectId} jobId - Job ID to add to batch
   * @returns {Promise<boolean>} - True if job was added to batch, false if sent to individual processing
   */
  async addJobToBatch(jobId) {
    try {
      if (!this.batchingEnabled) {
        logger.debug(`Batching disabled, skipping job ${jobId}`);
        return false;
      }

      // Find and validate the job
      const job = await ReportParsingJob.findById(jobId);
      if (!job) {
        logger.error(`Job ${jobId} not found for batch processing`);
        return false;
      }

      // Check if job should be batched
      if (!job.shouldBeBatched()) {
        logger.debug(`Job ${jobId} should not be batched (urgent: ${job.urgent}, priority: ${job.priority}, mode: ${job.batchInfo.processingMode})`);
        return false;
      }

      // Mark job as batched
      await job.markAsBatched(null, null); // Batch ID will be set when batch is created
      
      logger.info(`Job ${jobId} added to batch accumulator`);

      // Start or reset accumulation timer
      this.startAccumulationTimer();

      // Check if we should trigger batch immediately
      const batchedJobs = await this.getBatchedJobs();
      if (batchedJobs.length >= this.batchSize) {
        logger.info(`Batch size threshold reached (${batchedJobs.length}/${this.batchSize}), triggering immediate submission`);
        await this.triggerBatchSubmission('size_threshold');
      }

      return true;

    } catch (error) {
      logger.error(`Failed to add job ${jobId} to batch:`, error);
      
      // Fallback to individual processing
      await this.fallbackJobToIndividual(jobId, error.message);
      return false;
    }
  }

  /**
   * Get jobs that are ready for batching
   * @returns {Promise<Array>} - Array of batched jobs
   */
  async getBatchedJobs() {
    try {
      return await ReportParsingJob.findBatchedJobs(this.batchSize);
    } catch (error) {
      logger.error('Error fetching batched jobs:', error);
      return [];
    }
  }

  /**
   * Start or reset the accumulation timer
   */
  startAccumulationTimer() {
    // Clear existing timer
    if (this.accumulationTimer) {
      clearTimeout(this.accumulationTimer);
    }

    // Set new timer
    this.accumulationTimer = setTimeout(async () => {
      await this.triggerBatchSubmission('timer_timeout');
      this.accumulationTimer = null;
    }, this.maxWaitTime);

    logger.debug(`Accumulation timer started/reset for ${this.maxWaitTime}ms`);
  }

  /**
   * Stop the accumulation timer
   */
  stopAccumulationTimer() {
    if (this.accumulationTimer) {
      clearTimeout(this.accumulationTimer);
      this.accumulationTimer = null;
      logger.debug('Accumulation timer stopped');
    }
  }

  /**
   * Trigger batch submission
   * @param {string} trigger - Reason for triggering ('size_threshold', 'timer_timeout', 'manual', 'age_limit')
   * @returns {Promise<Object>} - Result object with submission details
   */
  async triggerBatchSubmission(trigger = 'manual') {
    if (this.isAccumulating) {
      logger.debug('Batch submission already in progress, skipping trigger');
      return { skipped: true, reason: 'already_accumulating' };
    }

    try {
      this.isAccumulating = true;
      this.stopAccumulationTimer();

      logger.info(`Triggering batch submission (reason: ${trigger})`);

      // Get jobs ready for batching
      const batchedJobs = await this.getBatchedJobs();
      
      if (batchedJobs.length === 0) {
        logger.debug('No jobs available for batching');
        return { skipped: true, reason: 'no_jobs', trigger };
      }

      // Check minimum batch size (except for age-based triggers)
      if (trigger !== 'age_limit' && batchedJobs.length < this.minBatchSize) {
        logger.debug(`Insufficient jobs for batch (${batchedJobs.length}/${this.minBatchSize}), waiting longer`);
        this.startAccumulationTimer(); // Restart timer
        return { skipped: true, reason: 'insufficient_jobs', count: batchedJobs.length, trigger };
      }

      // Submit batch
      const startTime = Date.now();
      const claudeBatch = await claudeBatchService.submitBatch(batchedJobs);
      const processingTime = Date.now() - startTime;

      // Update statistics
      this.updateStats(batchedJobs.length, processingTime);
      this.lastBatchTime = Date.now();

      if (claudeBatch) {
        logger.info(`Batch submission successful: ${claudeBatch.batchId} with ${batchedJobs.length} jobs (${processingTime}ms)`);
        
        return {
          success: true,
          batchId: claudeBatch.batchId,
          jobCount: batchedJobs.length,
          processingTime,
          trigger,
          claudeBatch
        };
      } else {
        logger.warn('Batch submission returned null (likely all jobs filtered out)');
        return {
          success: true,
          batchId: null,
          jobCount: 0,
          processingTime,
          trigger,
          reason: 'all_jobs_filtered'
        };
      }

    } catch (error) {
      logger.error(`Batch submission failed (trigger: ${trigger}):`, error);
      this.stats.fallbacksTriggered++;
      
      return {
        success: false,
        error: error.message,
        trigger,
        processingTime: Date.now() - (this.isAccumulating ? Date.now() : 0)
      };
    } finally {
      this.isAccumulating = false;
    }
  }

  /**
   * Check for old jobs that should be processed even if batch isn't full
   * @returns {Promise<boolean>} - True if batch was triggered due to age
   */
  async checkBatchAge() {
    try {
      const oldestBatchedJob = await ReportParsingJob.findOne({
        status: 'batched',
        'batchInfo.processingMode': 'batch'
      }).sort({ 'batchInfo.batchSubmittedAt': 1 });

      if (!oldestBatchedJob || !oldestBatchedJob.batchInfo.batchSubmittedAt) {
        return false;
      }

      const jobAge = Date.now() - oldestBatchedJob.batchInfo.batchSubmittedAt.getTime();
      
      if (jobAge > this.maxBatchAge) {
        logger.info(`Triggering batch due to job age (${Math.round(jobAge / 1000)}s > ${Math.round(this.maxBatchAge / 1000)}s)`);
        await this.triggerBatchSubmission('age_limit');
        return true;
      }

      return false;
    } catch (error) {
      logger.error('Error checking batch age:', error);
      return false;
    }
  }

  /**
   * Fallback a single job to individual processing
   * @param {string|ObjectId} jobId - Job ID to fallback
   * @param {string} reason - Reason for fallback
   */
  async fallbackJobToIndividual(jobId, reason) {
    try {
      const job = await ReportParsingJob.findById(jobId);
      if (job) {
        await job.fallbackToIndividual();
        logger.info(`Job ${jobId} fell back to individual processing: ${reason}`);
      }
    } catch (error) {
      logger.error(`Failed to fallback job ${jobId}:`, error);
    }
  }

  /**
   * Update statistics
   * @param {number} batchSize - Size of submitted batch
   * @param {number} processingTime - Time taken to process batch
   */
  updateStats(batchSize, processingTime) {
    this.stats.batchesSubmitted++;
    this.stats.jobsProcessed += batchSize;
    this.stats.lastBatchSize = batchSize;
    
    // Calculate average batch size
    this.stats.averageBatchSize = Math.round(this.stats.jobsProcessed / this.stats.batchesSubmitted);
    
    logger.debug('Batch statistics updated', {
      batchesSubmitted: this.stats.batchesSubmitted,
      jobsProcessed: this.stats.jobsProcessed,
      averageBatchSize: this.stats.averageBatchSize,
      processingTime
    });
  }

  /**
   * Get accumulator statistics
   * @returns {Object} - Statistics object
   */
  getStats() {
    return {
      ...this.stats,
      batchingEnabled: this.batchingEnabled,
      isAccumulating: this.isAccumulating,
      hasActiveTimer: !!this.accumulationTimer,
      timeSinceLastBatch: Date.now() - this.lastBatchTime,
      config: {
        batchSize: this.batchSize,
        maxWaitTime: this.maxWaitTime,
        minBatchSize: this.minBatchSize,
        maxBatchAge: this.maxBatchAge
      }
    };
  }

  /**
   * Get current batch status
   * @returns {Promise<Object>} - Current batch status
   */
  async getBatchStatus() {
    try {
      const batchedJobs = await this.getBatchedJobs();
      const oldestJob = batchedJobs.length > 0 ? batchedJobs[0] : null;
      
      return {
        queuedJobs: batchedJobs.length,
        oldestJobAge: oldestJob ? Date.now() - oldestJob.batchInfo.batchSubmittedAt?.getTime() : null,
        nextTrigger: this.accumulationTimer ? 'timer' : 'manual',
        timeUntilTrigger: this.accumulationTimer ? this.maxWaitTime : null,
        isAccumulating: this.isAccumulating,
        batchingEnabled: this.batchingEnabled
      };
    } catch (error) {
      logger.error('Error getting batch status:', error);
      return { error: error.message };
    }
  }

  /**
   * Force submission of current batch (admin function)
   * @returns {Promise<Object>} - Submission result
   */
  async forceSubmission() {
    logger.info('Forcing batch submission (admin request)');
    return await this.triggerBatchSubmission('manual');
  }

  /**
   * Enable or disable batch processing
   * @param {boolean} enabled - Whether to enable batch processing
   */
  setBatchingEnabled(enabled) {
    const wasEnabled = this.batchingEnabled;
    this.batchingEnabled = enabled;
    
    if (!enabled && this.accumulationTimer) {
      this.stopAccumulationTimer();
    }
    
    logger.info(`Batch processing ${enabled ? 'enabled' : 'disabled'}${wasEnabled !== enabled ? ' (changed)' : ''}`);
  }

  /**
   * Cleanup method to be called on shutdown
   */
  cleanup() {
    this.stopAccumulationTimer();
    logger.info('BatchAccumulator cleanup completed');
  }
}

module.exports = new BatchAccumulator();