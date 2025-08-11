const logger = require('../config/logger');
const { createReportParsingQueue } = require('./reportParsingQueue');
const { createTelegramScrapingQueue } = require('./telegramScrapingQueue');
const { createReportProcessingQueue } = require('./reportProcessingQueue');
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

  // Initialize queues
  reportParsingQueue = createReportParsingQueue(redisConfig);
  telegramScrapingQueue = createTelegramScrapingQueue(redisConfig);
  reportProcessingQueue = createReportProcessingQueue(redisConfig);

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
          const TelegramScraper = require('../services/TelegramScraper');
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