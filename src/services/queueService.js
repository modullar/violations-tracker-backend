const Queue = require('bull');
const logger = require('../config/logger');
const claudeParser = require('./claudeParser');
const ReportParsingJob = require('../models/jobs/ReportParsingJob');
const Violation = require('../models/Violation');
const { geocodeLocation } = require('../utils/geocoder');

// Create queues
const reportParsingQueue = new Queue('report-parsing-queue', {
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT) || 6379,
    password: process.env.REDIS_PASSWORD
  },
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
const telegramScrapingQueue = new Queue('telegram-scraping-queue', {
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT) || 6379,
    password: process.env.REDIS_PASSWORD
  },
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
        // Add the submitter as creator
        violation.created_by = dbJob.submittedBy;
        violation.updated_by = dbJob.submittedBy;
        
        // Add source URL if available
        if (sourceURL && sourceURL.name) {
          violation.source = violation.source || { en: '', ar: '' };
          violation.source.en = `${violation.source.en ? violation.source.en + '. ' : ''}${sourceURL.name}`;
          
          if (sourceURL.url) {
            violation.source_url = violation.source_url || { en: '', ar: '' };
            violation.source_url.en = sourceURL.url;
          }
        }
        
        // Process geocoding if needed
        if (violation.location && violation.location.name) {
          try {
            // Try both Arabic and English location names
            const locationNameAr = violation.location.name.ar || '';
            const locationNameEn = violation.location.name.en || '';
            const adminDivisionAr = violation.location.administrative_division ? 
              (violation.location.administrative_division.ar || '') : '';
            const adminDivisionEn = violation.location.administrative_division ? 
              (violation.location.administrative_division.en || '') : '';
            
            logger.info(`Attempting to geocode location: ${locationNameEn || locationNameAr}`);
            
            // Try Arabic first if available
            let geoDataAr = locationNameAr ? await geocodeLocation(locationNameAr, adminDivisionAr) : null;
            
            // Try English
            let geoDataEn = await geocodeLocation(locationNameEn, adminDivisionEn);
            
            // Use the best result based on quality score
            let geoData;
            if (geoDataAr && geoDataAr.length > 0 && geoDataEn && geoDataEn.length > 0) {
              // If we have both results, pick the one with higher quality
              geoData = (geoDataAr[0].quality || 0) >= (geoDataEn[0].quality || 0) ? geoDataAr : geoDataEn;
              logger.info(`Using ${geoData === geoDataAr ? 'Arabic' : 'English'} geocoding result with quality ${geoData[0].quality || 0}`);
            } else {
              // Otherwise use whichever one succeeded
              geoData = (geoDataAr && geoDataAr.length > 0) ? geoDataAr : geoDataEn;
            }

            if (geoData && geoData.length > 0) {
              violation.location.coordinates = [
                geoData[0].longitude,
                geoData[0].latitude
              ];
              logger.info(`Successfully geocoded to coordinates: [${geoData[0].longitude}, ${geoData[0].latitude}]`);
            } else {
              throw new Error(`Could not find valid coordinates for location. Tried both Arabic (${locationNameAr}) and English (${locationNameEn}) names.`);
            }
          } catch (geoError) {
            logger.error(`Geocoding failed for location: ${geoError.message}`);
            throw new Error(`Geocoding failed: ${geoError.message}. Please verify the location names.`);
          }
        } else {
          throw new Error('Location name is required.');
        }

        // Create the violation
        const newViolation = await Violation.create(violation);
        createdViolations.push(newViolation._id);
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
    // Add a repeating job for Telegram scraping
    await telegramScrapingQueue.add('telegram-scraping', {
      startedAt: new Date(),
      description: 'Automated Telegram channel scraping'
    }, {
      repeat: { cron: '*/5 * * * *' },
      jobId: 'telegram-scraping-recurring' // Use fixed ID to prevent duplicates
    });
    
    logger.info('Telegram scraping recurring job added to queue (every 5 minutes)');
  } catch (error) {
    logger.error('Error starting Telegram scraping job:', error);
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
    logger.info('Queue service cleanup completed');
  } catch (error) {
    logger.error('Error during queue service cleanup:', error);
  }
};

module.exports = {
  addJob,
  reportParsingQueue,
  telegramScrapingQueue,
  startTelegramScraping,
  stopTelegramScraping,
  triggerManualScraping,
  cleanup
};