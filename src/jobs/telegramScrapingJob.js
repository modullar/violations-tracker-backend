const logger = require('../config/logger');
const { triggerTelegramScraping, startRecurringTelegramScraping, stopRecurringTelegramScraping } = require('../services/queueService');

class TelegramScrapingJobManager {
  constructor() {
    this.stats = {
      totalManualRuns: 0,
      lastManualRun: null,
      lastError: null
    };
  }

  /**
   * Trigger a manual scraping run (adds job to Bull queue)
   */
  async forceRun() {
    try {
      logger.info('Triggering manual Telegram scraping run');
      const job = await triggerTelegramScraping();
      
      this.stats.totalManualRuns++;
      this.stats.lastManualRun = new Date();
      this.stats.lastError = null;
      
      logger.info(`Manual Telegram scraping job ${job.jobId} added to queue`);
      return {
        success: true,
        jobId: job.jobId,
        message: 'Manual scraping job added to queue'
      };
    } catch (error) {
      this.stats.lastError = error.message;
      logger.error('Failed to trigger manual Telegram scraping:', error);
      throw error;
    }
  }

  /**
   * Start the scheduled scraping (via Bull queue)
   */
  async start() {
    try {
      await startRecurringTelegramScraping();
      logger.info('Telegram scraping recurring job started');
      return {
        success: true,
        message: 'Recurring scraping job started (every 5 minutes)'
      };
    } catch (error) {
      logger.error('Failed to start Telegram scraping:', error);
      throw error;
    }
  }

  /**
   * Stop the scheduled scraping (via Bull queue)
   */
  async stop() {
    try {
      await stopRecurringTelegramScraping();
      logger.info('Telegram scraping recurring job stopped');
      return {
        success: true,
        message: 'Recurring scraping job stopped'
      };
    } catch (error) {
      logger.error('Failed to stop Telegram scraping:', error);
      throw error;
    }
  }

  /**
   * Get job manager status and statistics
   */
  getStatus() {
    return {
      stats: this.stats,
      queueEnabled: true,
      description: 'Telegram scraping is managed via Bull queue system. View jobs at /admin/queues'
    };
  }
}

// Create singleton instance
const telegramScrapingJobManager = new TelegramScrapingJobManager();

module.exports = telegramScrapingJobManager;