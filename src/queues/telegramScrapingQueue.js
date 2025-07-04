const Queue = require('bull');
const logger = require('../config/logger');

const createTelegramScrapingQueue = (redisConfig) => {
  const queue = new Queue('telegram-scraping-queue', {
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

  // Process Telegram scraping jobs
  queue.process('telegram-scraping', async (job) => {
    const TelegramScraper = require('../services/TelegramScraper');
    
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
  queue.on('completed', (job, result) => {
    logger.info(`Telegram scraping job ${job.id} completed successfully:`, {
      newReports: result.newReports,
      duplicates: result.duplicates
    });
  });

  queue.on('failed', (job, error) => {
    logger.error(`Telegram scraping job ${job.id} failed:`, error);
  });

  queue.on('stalled', (job) => {
    logger.warn(`Telegram scraping job ${job.id} stalled`);
  });

  return queue;
};

module.exports = { createTelegramScrapingQueue }; 