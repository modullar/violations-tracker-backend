const Queue = require('bull');
const logger = require('../config/logger');
const Report = require('../models/Report');
const { processReport, processReportsBatch } = require('../commands/violations/process');

const createReportProcessingQueue = (redisConfig) => {
  const queue = new Queue('report-processing-queue', {
    redis: redisConfig,
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 5000
      },
      removeOnComplete: 100,  // Keep last 100 completed jobs
      removeOnFail: 200,      // Keep last 200 failed jobs
      repeat: {
        cron: '*/10 * * * *'  // Every 10 minutes
      }
    }
  });

  // Process batch report processing jobs
  queue.process('batch-process-reports', async (job) => {
    try {
      logger.info(`Starting batch report processing job ${job.id}`);
      job.progress(5);
      
      // Get up to 15 reports ready for processing
      const reports = await Report.findReadyForProcessing(15);
      
      if (reports.length === 0) {
        logger.info('No reports ready for processing');
        job.progress(100);
        return {
          success: true,
          reportsProcessed: 0,
          violationsCreated: 0,
          message: 'No reports ready for processing'
        };
      }

      logger.info(`Found ${reports.length} reports ready for processing`);
      job.progress(10);

      // Determine processing method based on environment configuration
      const batchSize = parseInt(process.env.CLAUDE_BATCH_SIZE) || 8;
      const useBatchProcessing = process.env.CLAUDE_BATCH_ENABLED !== 'false';
      
      let totalViolationsCreated = 0;
      let successfulReports = 0;
      let failedReports = 0;

      if (useBatchProcessing && reports.length >= 3) {
        // NEW: Batch Processing Path
        logger.info('Using batch processing approach');
        
        // Create batches for processing
        const batches = [];
        for (let i = 0; i < reports.length; i += batchSize) {
          batches.push(reports.slice(i, i + batchSize));
        }
        
        logger.info(`Created ${batches.length} batches for processing`, {
          batchSize,
          totalReports: reports.length
        });
        
        // Process batches with limited concurrency (max 3 concurrent batch calls)
        const maxConcurrentBatches = 3;
        const batchChunks = [];
        for (let i = 0; i < batches.length; i += maxConcurrentBatches) {
          batchChunks.push(batches.slice(i, i + maxConcurrentBatches));
        }
        
        for (let chunkIndex = 0; chunkIndex < batchChunks.length; chunkIndex++) {
          const batchChunk = batchChunks[chunkIndex];
          const progressBase = 10 + (chunkIndex * 80 / batchChunks.length);
          
          logger.info(`Processing batch chunk ${chunkIndex + 1}/${batchChunks.length} (${batchChunk.length} batches)`);
          
          try {
            // Process batches in the chunk concurrently
            const batchPromises = batchChunk.map(async (batch, batchIndex) => {
              try {
                logger.info(`Processing batch ${chunkIndex * maxConcurrentBatches + batchIndex + 1} with ${batch.length} reports`);
                const batchResults = await processReportsBatch(batch);
                
                // Aggregate results from this batch
                let batchViolationsCreated = 0;
                let batchSuccessfulReports = 0;
                let batchFailedReports = 0;
                
                for (const result of batchResults) {
                  if (result.success) {
                    batchViolationsCreated += result.violationsCreated || 0;
                    batchSuccessfulReports++;
                  } else {
                    batchFailedReports++;
                  }
                }
                
                logger.info(`Batch ${chunkIndex * maxConcurrentBatches + batchIndex + 1} completed`, {
                  reportsInBatch: batch.length,
                  successfulReports: batchSuccessfulReports,
                  failedReports: batchFailedReports,
                  violationsCreated: batchViolationsCreated
                });
                
                return {
                  violationsCreated: batchViolationsCreated,
                  successfulReports: batchSuccessfulReports,
                  failedReports: batchFailedReports
                };
                
              } catch (error) {
                logger.error(`Batch ${chunkIndex * maxConcurrentBatches + batchIndex + 1} failed:`, error);
                return {
                  violationsCreated: 0,
                  successfulReports: 0,
                  failedReports: batch.length
                };
              }
            });

            const chunkResults = await Promise.all(batchPromises);
            
            // Aggregate results from all batches in this chunk
            for (const result of chunkResults) {
              totalViolationsCreated += result.violationsCreated;
              successfulReports += result.successfulReports;
              failedReports += result.failedReports;
            }
            
          } catch (error) {
            logger.error(`Batch chunk ${chunkIndex + 1} failed:`, error);
            // Count all reports in failed chunks as failed
            for (const batch of batchChunk) {
              failedReports += batch.length;
            }
          }
          
          // Update progress
          job.progress(Math.min(90, progressBase + (80 / batchChunks.length)));
          
          // Add delay between batch chunks for rate limiting
          if (chunkIndex < batchChunks.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 2000)); // Longer delay for batch processing
          }
        }
        
      } else {
        // EXISTING: Individual Processing Path (unchanged for fallback)
        logger.info('Using individual processing approach (batch processing disabled or too few reports)');
        
        const chunkSize = 3;
        const chunks = [];
        for (let i = 0; i < reports.length; i += chunkSize) {
          chunks.push(reports.slice(i, i + chunkSize));
        }

        // Process each chunk with delay between chunks
        for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
          const chunk = chunks[chunkIndex];
          const progressBase = 10 + (chunkIndex * 80 / chunks.length);
          
          logger.info(`Processing chunk ${chunkIndex + 1}/${chunks.length} (${chunk.length} reports)`);
          
          // Process chunk concurrently (max 3 concurrent Claude API calls)
          const chunkPromises = chunk.map(async (report) => {
            try {
              const result = await processReport(report);
              totalViolationsCreated += result.violationsCreated || 0;
              successfulReports++;
              return result;
            } catch (error) {
              logger.error(`Failed to process report ${report._id}:`, error);
              failedReports++;
              return { error: error.message, reportId: report._id };
            }
          });

          await Promise.all(chunkPromises);
          
          // Update progress
          job.progress(Math.min(90, progressBase + (80 / chunks.length)));
          
          // Add 1-second delay between chunks for rate limiting
          if (chunkIndex < chunks.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        }
      }

      job.progress(100);
      
      const result = {
        success: true,
        reportsProcessed: successfulReports,
        violationsCreated: totalViolationsCreated,
        failedReports: failedReports,
        totalReports: reports.length,
        completedAt: new Date()
      };

      logger.info('Batch report processing completed:', result);
      return result;
      
    } catch (error) {
      logger.error(`Batch report processing job ${job.id} failed:`, error);
      throw error;
    }
  });

  // Handle batch report processing job events
  queue.on('completed', (job, result) => {
    logger.info(`Batch report processing job ${job.id} completed:`, {
      reportsProcessed: result.reportsProcessed,
      violationsCreated: result.violationsCreated,
      failedReports: result.failedReports
    });
  });

  queue.on('failed', (job, error) => {
    logger.error(`Batch report processing job ${job.id} failed:`, error);
  });

  queue.on('stalled', (job) => {
    logger.warn(`Batch report processing job ${job.id} stalled`);
  });

  // Generic handler for unknown job types - logs and removes them
  queue.process('*', async (job) => {
    logger.warn(`Unknown job type "${job.name}" received in report processing queue. Removing job ${job.id}`);
    return { removed: true, reason: 'unknown_job_type' };
  });

  return queue;
};

module.exports = { createReportProcessingQueue }; 