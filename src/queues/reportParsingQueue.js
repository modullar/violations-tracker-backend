const Queue = require('bull');
const logger = require('../config/logger');
const claudeParser = require('../services/claudeParser');
const ReportParsingJob = require('../models/jobs/ReportParsingJob');
const { createSingleViolation } = require('../commands/violations/create');

const createReportParsingQueue = (redisConfig) => {
  const queue = new Queue('report-parsing-queue', {
    redis: redisConfig,
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 5000
      },
      removeOnComplete: 100,  // Keep last 100 completed jobs
      removeOnFail: 200       // Keep last 200 failed jobs
    }
  });

  // Process jobs
  queue.process(async (job, done) => {
    try {
      // Make sure no unhandled promise rejections occur
      process.on('unhandledRejection', (reason) => {
        logger.error(`Unhandled Rejection in job processing: ${reason}`, { jobId: job.data.jobId, error: reason });
      });
      
      logger.info(`Processing job ${job.id}: ${job.data.jobId}`);
      const { jobId } = job.data;
      
      // Find the job in the database
      const dbJob = await ReportParsingJob.findById(jobId);
      if (!dbJob) {
        throw new Error(`Job with ID ${jobId} not found in database`);
      }

      // Update status to processing
      await ReportParsingJob.findByIdAndUpdate(jobId, {
        status: 'processing',
        progress: 10
      });

      // Extract report text and source information
      const { reportText, sourceURL } = dbJob;

      // Parse the report with Claude
      let parsedViolations;
      try {
        // Verify Claude API key is configured
        if (!process.env.CLAUDE_API_KEY) {
          throw new Error('Claude API key is not configured. Please check your environment variables.');
        }
        
        logger.info(`Calling Claude API for job ${jobId} with text length: ${reportText.length} characters`);
        
        // Call Claude API to parse the report
        parsedViolations = await claudeParser.parseReport(reportText, sourceURL);
        
        // Update job status with progress
        await ReportParsingJob.findByIdAndUpdate(jobId, {
          progress: 40
        });
        
        logger.info(`Claude parsing completed successfully for job ${jobId}`);
      } catch (error) {
        const errorMessage = error.message || 'Unknown error';
        const errorDetail = error.responseData ? JSON.stringify(error.responseData) : '';
        const fullError = `Claude parsing failed: ${errorMessage}. ${errorDetail}`;
        
        logger.error(`Claude parsing error for job ${jobId}: ${fullError}`, {
          error: error.stack || error,
          jobId
        });
        
        await ReportParsingJob.findByIdAndUpdate(jobId, {
          status: 'failed',
          error: fullError
        });
        
        throw error;
      }

      // Validate the parsed violations
      await ReportParsingJob.findByIdAndUpdate(jobId, {
        status: 'validation',
        progress: 50
      });

      const { valid, invalid } = claudeParser.validateViolations(parsedViolations);
      
      logger.info(`Job ${jobId}: Validation complete. Valid: ${valid.length}, Invalid: ${invalid.length}`);
      
      // Update job with validation results
      await ReportParsingJob.findByIdAndUpdate(jobId, {
        progress: 70,
        status: 'creating_violations',
        'results.parsedViolationsCount': parsedViolations.length,
        'results.failedViolations': invalid
      });

      // No valid violations
      if (valid.length === 0) {
        await ReportParsingJob.findByIdAndUpdate(jobId, {
          status: 'completed',
          progress: 100,
          error: invalid.length > 0 ? 'All parsed violations failed validation' : 'No violations were extracted from the report'
        });
        done();
        return;
      }

      // Create violations in the database
      const createdViolations = [];
      const failedCreations = [];

      for (const violation of valid) {
        try {
          // Add source URL if available
          if (sourceURL && sourceURL.name) {
            violation.source = violation.source || { en: '', ar: '' };
            violation.source.en = `${violation.source.en ? violation.source.en + '. ' : ''}${sourceURL.name}`;
            
            if (sourceURL.url) {
              violation.source_url = violation.source_url || { en: '', ar: '' };
              violation.source_url.en = sourceURL.url;
            }
          }

          // Use the proper creation function with duplicate checking enabled
          const result = await createSingleViolation(violation, dbJob.submittedBy, {
            checkDuplicates: true,
            mergeDuplicates: true,
            duplicateThreshold: 0.85 // Slightly higher threshold for LLM-parsed content
          });

          if (result.wasMerged) {
            logger.info('LLM violation merged with existing violation', {
              newViolationData: violation.description?.en?.substring(0, 100) + '...',
              mergedWithId: result.duplicateInfo.originalId,
              similarity: result.duplicateInfo.similarity,
              exactMatch: result.duplicateInfo.exactMatch
            });
          } else {
            logger.info('LLM violation created as new violation', {
              violationId: result.violation._id,
              type: result.violation.type,
              location: result.violation.location?.name?.en
            });
          }

          createdViolations.push(result.violation._id);
        } catch (error) {
          logger.error(`Failed to create violation: ${error.message}`);
          failedCreations.push({
            violation,
            error: error.message
          });
        }
      }

      // Update job with final results
      await ReportParsingJob.findByIdAndUpdate(jobId, {
        status: 'completed',
        progress: 100,
        'results.createdViolationsCount': createdViolations.length,
        'results.violations': createdViolations,
        'results.failedViolations': [...invalid, ...failedCreations]
      });

      logger.info(`Job ${jobId} completed. Created ${createdViolations.length} violations.`);
      done();
    } catch (error) {
      const errorMessage = error.message || 'Unknown error';
      logger.error(`Job processing error: ${errorMessage}`, {
        error: error.stack || error,
        jobId: job.data.jobId
      });
      
      // If we haven't already marked the job as failed, do so now
      if (job.data.jobId) {
        try {
          await ReportParsingJob.findByIdAndUpdate(job.data.jobId, {
            status: 'failed',
            error: errorMessage
          });
        } catch (updateErr) {
          logger.error(`Failed to update job status: ${updateErr.message}`, {
            originalError: errorMessage,
            updateError: updateErr.stack || updateErr
          });
        }
      }
      
      done(error);
    }
  });

  // Handle job completion
  queue.on('completed', (job) => {
    logger.info(`Job ${job.id} completed successfully`);
  });

  // Handle job failure
  queue.on('failed', (job, error) => {
    logger.error(`Job ${job.id} failed: ${error.message}`);
  });

  return queue;
};

module.exports = { createReportParsingQueue }; 