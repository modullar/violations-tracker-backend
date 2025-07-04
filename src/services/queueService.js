const Queue = require('bull');
const logger = require('../config/logger');
const claudeParser = require('./claudeParser');
const ReportParsingJob = require('../models/jobs/ReportParsingJob');
const { createSingleViolation } = require('../commands/violations/create');
const Report = require('../models/Report');
const { processReport } = require('../commands/violations/process');

// Check if Redis is available
let redisAvailable = true;
let reportParsingQueue;
let telegramScrapingQueue;
let reportProcessingQueue;

try {
  logger.info('Attempting to initialize queues with Redis...');

  // Create Redis configuration
  // Priority: REDIS_URL (full URL) > INTERNAL_REDIS_URL (Render internal) > individual components
  let redisConfig;
  
  if (process.env.REDIS_URL) {
    redisConfig = process.env.REDIS_URL;
    logger.info('Using REDIS_URL for connection');
  } else if (process.env.INTERNAL_REDIS_URL) {
    redisConfig = process.env.INTERNAL_REDIS_URL;
    logger.info('Using INTERNAL_REDIS_URL for connection');
  } else {
    redisConfig = {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT) || 6379,
      password: process.env.REDIS_PASSWORD
    };
    logger.info('Using individual Redis configuration components');
  }

  reportParsingQueue = new Queue('report-parsing-queue', {
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

  // Create Telegram scraping queue
  telegramScrapingQueue = new Queue('telegram-scraping-queue', {
    redis: redisConfig,
    defaultJobOptions: {
      attempts: 2,
      backoff: {
        type: 'exponential',
        delay: 3000
      },
      removeOnComplete: 50,   // Keep last 50 completed jobs
      removeOnFail: 100,      // Keep last 100 failed jobs
      repeat: {
        cron: '*/5 * * * *'   // Every 5 minutes
      }
    }
  });

  // Create Report processing queue for batch processing
  reportProcessingQueue = new Queue('report-processing-queue', {
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

  // Test Redis connection
  reportParsingQueue.on('error', (error) => {
    logger.error('Queue error - Redis may not be available:', error);
    redisAvailable = false;
  });

  telegramScrapingQueue.on('error', (error) => {
    logger.error('Telegram queue error - Redis may not be available:', error);
    redisAvailable = false;
  });

  reportProcessingQueue.on('error', (error) => {
    logger.error('Report processing queue error - Redis may not be available:', error);
    redisAvailable = false;
  });

  logger.info('Queues initialized successfully with Redis');

} catch (error) {
  logger.warn('Redis not available - initializing fallback mode:', error.message);
  redisAvailable = false;
  
  // Create mock queues for fallback
  reportParsingQueue = {
    process: () => {},
    add: () => Promise.resolve({ id: 'mock' }),
    on: () => {},
    close: () => Promise.resolve()
  };
  
  telegramScrapingQueue = {
    process: () => {},
    add: () => Promise.resolve({ id: 'mock' }),
    removeRepeatable: () => Promise.resolve(),
    on: () => {},
    close: () => Promise.resolve()
  };

  reportProcessingQueue = {
    process: () => {},
    add: () => Promise.resolve({ id: 'mock' }),
    removeRepeatable: () => Promise.resolve(),
    on: () => {},
    close: () => Promise.resolve()
  };
}

// Process jobs
reportParsingQueue.process(async (job, done) => {
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
reportParsingQueue.on('completed', (job) => {
  logger.info(`Job ${job.id} completed successfully`);
});

// Handle job failure
reportParsingQueue.on('failed', (job, error) => {
  logger.error(`Job ${job.id} failed: ${error.message}`);
});

// Process batch report processing jobs
reportProcessingQueue.process('batch-process-reports', async (job) => {
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

    logger.info(`Batch report processing completed:`, result);
    return result;
    
  } catch (error) {
    logger.error(`Batch report processing job ${job.id} failed:`, error);
    throw error;
  }
});

// Handle batch report processing job events
reportProcessingQueue.on('completed', (job, result) => {
  logger.info(`Batch report processing job ${job.id} completed:`, {
    reportsProcessed: result.reportsProcessed,
    violationsCreated: result.violationsCreated,
    failedReports: result.failedReports
  });
});

reportProcessingQueue.on('failed', (job, error) => {
  logger.error(`Batch report processing job ${job.id} failed:`, error);
});

reportProcessingQueue.on('stalled', (job) => {
  logger.warn(`Batch report processing job ${job.id} stalled`);
});

// Process Telegram scraping jobs
telegramScrapingQueue.process('telegram-scraping', async (job) => {
  const TelegramScraper = require('./TelegramScraper');
  
  try {
    logger.info(`Starting Telegram scraping job ${job.id}`);
    job.progress(10);
    
    const scraper = new TelegramScraper();
    job.progress(20);
    
    const results = await scraper.scrapeAllChannels();
    job.progress(90);
    
    logger.info(`Telegram scraping job ${job.id} completed:`, {
      newReports: results.newReports,
      duplicates: results.duplicates,
      successfulChannels: results.success,
      failedChannels: results.failed
    });
    
    job.progress(100);
    
    return {
      success: true,
      newReports: results.newReports,
      duplicates: results.duplicates,
      channels: results.channels,
      completedAt: new Date()
    };
    
  } catch (error) {
    logger.error(`Telegram scraping job ${job.id} failed:`, error);
    throw error;
  }
});

// Handle Telegram scraping job events
telegramScrapingQueue.on('completed', (job, result) => {
  logger.info(`Telegram scraping job ${job.id} completed successfully:`, {
    newReports: result.newReports,
    duplicates: result.duplicates
  });
});

telegramScrapingQueue.on('failed', (job, error) => {
  logger.error(`Telegram scraping job ${job.id} failed:`, error);
});

telegramScrapingQueue.on('stalled', (job) => {
  logger.warn(`Telegram scraping job ${job.id} stalled`);
});

// Add a job to the queue
const addJob = async (jobId) => {
  await reportParsingQueue.add({ jobId }, {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000
    }
  });
};

// Add function to start Telegram scraping
const startTelegramScraping = async () => {
  try {
    if (redisAvailable) {
      // Add a repeating job for Telegram scraping
      await telegramScrapingQueue.add('telegram-scraping', {
        startedAt: new Date(),
        description: 'Automated Telegram channel scraping'
      }, {
        repeat: { cron: '*/5 * * * *' },
        jobId: 'telegram-scraping-recurring' // Use fixed ID to prevent duplicates
      });
      
      logger.info('Telegram scraping recurring job added to queue (every 5 minutes)');
    } else {
      // Fallback: Use setInterval for scraping when Redis is not available
      logger.warn('Redis not available - using fallback timer for Telegram scraping');
      
      const runScraping = async () => {
        try {
          const TelegramScraper = require('./TelegramScraper');
          const scraper = new TelegramScraper();
          const results = await scraper.scrapeAllChannels();
          
          logger.info('Fallback Telegram scraping completed:', {
            newReports: results.newReports,
            duplicates: results.duplicates,
            successfulChannels: results.success,
            failedChannels: results.failed
          });
        } catch (error) {
          logger.error('Fallback Telegram scraping failed:', error);
        }
      };
      
      // Run immediately
      runScraping();
      
      // Then every 5 minutes
      setInterval(runScraping, 5 * 60 * 1000);
      
      logger.info('Telegram scraping fallback timer started (every 5 minutes)');
    }
  } catch (error) {
    logger.error('Error starting Telegram scraping job:', error);
  }
};

// Add function to start batch report processing
const startBatchReportProcessing = async () => {
  try {
    if (redisAvailable) {
      // Add a repeating job for batch report processing
      await reportProcessingQueue.add('batch-process-reports', {
        startedAt: new Date(),
        description: 'Automated batch report processing'
      }, {
        repeat: { cron: '*/10 * * * *' },
        jobId: 'batch-report-processing-recurring' // Use fixed ID to prevent duplicates
      });
      
      logger.info('Batch report processing recurring job added to queue (every 10 minutes)');
    } else {
      // Fallback: Use setInterval for processing when Redis is not available
      logger.warn('Redis not available - using fallback timer for batch report processing');
      
      const runProcessing = async () => {
        try {
          const reports = await Report.findReadyForProcessing(15);
          
          if (reports.length === 0) {
            logger.debug('No reports ready for processing');
            return;
          }

          logger.info(`Processing ${reports.length} reports in fallback mode`);
          
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
            
            // Add 1-second delay between chunks for rate limiting
            if (chunkIndex < chunks.length - 1) {
              await new Promise(resolve => setTimeout(resolve, 1000));
            }
          }

          logger.info('Fallback batch report processing completed:', {
            reportsProcessed: successfulReports,
            violationsCreated: totalViolationsCreated,
            failedReports: failedReports,
            totalReports: reports.length
          });
        } catch (error) {
          logger.error('Fallback batch report processing failed:', error);
        }
      };
      
      // Run immediately
      runProcessing();
      
      // Then every 10 minutes
      setInterval(runProcessing, 10 * 60 * 1000);
      
      logger.info('Batch report processing fallback timer started (every 10 minutes)');
    }
  } catch (error) {
    logger.error('Error starting batch report processing job:', error);
  }
};

// Add function to stop Telegram scraping
const stopTelegramScraping = async () => {
  try {
    await telegramScrapingQueue.removeRepeatable('telegram-scraping', {
      cron: '*/5 * * * *',
      jobId: 'telegram-scraping-recurring'
    });
    logger.info('Telegram scraping recurring job removed from queue');
  } catch (error) {
    logger.error('Error stopping Telegram scraping job:', error);
  }
};

// Add function to stop batch report processing
const stopBatchReportProcessing = async () => {
  try {
    await reportProcessingQueue.removeRepeatable('batch-process-reports', {
      cron: '*/10 * * * *',
      jobId: 'batch-report-processing-recurring'
    });
    logger.info('Batch report processing recurring job removed from queue');
  } catch (error) {
    logger.error('Error stopping batch report processing job:', error);
  }
};

// Add function to trigger manual scraping
const triggerManualScraping = async () => {
  try {
    const job = await telegramScrapingQueue.add('telegram-scraping', {
      startedAt: new Date(),
      description: 'Manual Telegram channel scraping',
      manual: true
    });
    
    logger.info(`Manual Telegram scraping job ${job.id} added to queue`);
    return job;
  } catch (error) {
    logger.error('Error triggering manual Telegram scraping:', error);
    throw error;
  }
};

// Cleanup function to close Redis connections
const cleanup = async () => {
  try {
    await reportParsingQueue.close();
    await telegramScrapingQueue.close();
    await reportProcessingQueue.close();
    logger.info('Queue service cleanup completed');
  } catch (error) {
    logger.error('Error during queue service cleanup:', error);
  }
};

module.exports = {
  addJob,
  reportParsingQueue,
  telegramScrapingQueue,
  reportProcessingQueue,
  startTelegramScraping,
  stopTelegramScraping,
  startBatchReportProcessing,
  stopBatchReportProcessing,
  triggerManualScraping,
  cleanup
};