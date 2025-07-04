const Queue = require('bull');
const logger = require('../config/logger');
const Report = require('../models/Report');
const { processReport } = require('../commands/violations/process');

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

      // Process reports in chunks of 3 for rate limiting
      const chunkSize = 3;
      const chunks = [];
      for (let i = 0; i < reports.length; i += chunkSize) {
        chunks.push(reports.slice(i, i + chunkSize));
      }

      let totalViolationsCreated = 0;
      let successfulReports = 0;
      let failedReports = 0;

      // Process each chunk with delay between chunks
      for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
        const chunk = chunks[chunkIndex];
        const progressBase = 10 + (chunkIndex * 80 / chunks.length);
        
        logger.info(`Processing chunk ${chunkIndex + 1}/${chunks.length} (${chunk.length} reports)`);
        
        // Process chunk concurrently (max 3 concurrent Claude API calls)
        const chunkPromises = chunk.map(async (report) => {
          try {
            const result = await processReport(report);
            totalViolationsCreated += result.violationsCreated;
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

  return queue;
};

module.exports = { createReportProcessingQueue }; 