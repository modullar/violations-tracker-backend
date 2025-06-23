const cron = require('node-cron');
const logger = require('../config/logger');
const TelegramScraper = require('../services/TelegramScraper');

class TelegramScrapingJob {
  constructor() {
    this.scraper = new TelegramScraper();
    this.isRunning = false;
    this.schedule = null;
    this.lastRun = null;
    this.totalRuns = 0;
    this.stats = {
      totalReports: 0,
      successfulRuns: 0,
      failedRuns: 0,
      lastError: null
    };
  }

  /**
   * Start the scheduled scraping job
   */
  start() {
    if (this.schedule) {
      logger.warn('Telegram scraping job is already running');
      return;
    }

    // Schedule to run every 5 minutes
    this.schedule = cron.schedule('*/5 * * * *', async () => {
      await this.runScraping();
    }, {
      scheduled: false,
      timezone: 'UTC'
    });

    this.schedule.start();
    logger.info('Telegram scraping job scheduled to run every 5 minutes');
  }

  /**
   * Stop the scheduled scraping job
   */
  stop() {
    if (this.schedule) {
      this.schedule.stop();
      this.schedule = null;
      logger.info('Telegram scraping job stopped');
    }
  }

  /**
   * Run the scraping process
   */
  async runScraping() {
    if (this.isRunning) {
      logger.warn('Telegram scraping already in progress, skipping this run');
      return;
    }

    this.isRunning = true;
    this.lastRun = new Date();
    this.totalRuns++;

    logger.info(`Starting Telegram scraping run #${this.totalRuns}`);

    try {
      const startTime = Date.now();
      const results = await this.scraper.scrapeAllChannels();
      const duration = Date.now() - startTime;

      // Update statistics
      this.stats.totalReports += results.newReports;
      this.stats.successfulRuns++;
      this.stats.lastError = null;

      logger.info(`Scraping run #${this.totalRuns} completed in ${duration}ms:`, {
        newReports: results.newReports,
        duplicates: results.duplicates,
        successfulChannels: results.success,
        failedChannels: results.failed
      });

      // Log detailed channel results
      results.channels.forEach(channel => {
        if (channel.status === 'success') {
          logger.debug(`Channel ${channel.name}: ${channel.newReports} new, ${channel.duplicates} duplicates`);
        } else {
          logger.error(`Channel ${channel.name} failed: ${channel.error}`);
        }
      });

    } catch (error) {
      this.stats.failedRuns++;
      this.stats.lastError = error.message;
      
      logger.error(`Telegram scraping run #${this.totalRuns} failed:`, error);
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Force run scraping (for manual triggers)
   */
  async forceRun() {
    logger.info('Forcing Telegram scraping run');
    await this.runScraping();
  }

  /**
   * Get job status and statistics
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      isScheduled: !!this.schedule,
      lastRun: this.lastRun,
      totalRuns: this.totalRuns,
      stats: this.stats,
      nextRun: this.schedule ? this.getNextRunTime() : null
    };
  }

  /**
   * Get next scheduled run time
   */
  getNextRunTime() {
    if (!this.schedule) return null;
    
    // Calculate next 5-minute interval
    const now = new Date();
    const nextRun = new Date(now);
    const minutes = now.getMinutes();
    const nextMinutes = Math.ceil(minutes / 5) * 5;
    
    if (nextMinutes >= 60) {
      nextRun.setHours(now.getHours() + 1);
      nextRun.setMinutes(0);
    } else {
      nextRun.setMinutes(nextMinutes);
    }
    
    nextRun.setSeconds(0);
    nextRun.setMilliseconds(0);
    
    return nextRun;
  }

  /**
   * Get scraper statistics
   */
  async getScraperStats() {
    return await this.scraper.getStats();
  }

  /**
   * Test connectivity to all channels
   */
  async testAllChannels() {
    const results = [];
    
    for (const channel of this.scraper.activeChannels) {
      try {
        const result = await this.scraper.testChannel(channel.name);
        results.push(result);
      } catch (error) {
        results.push({
          channel: channel.name,
          accessible: false,
          error: error.message
        });
      }
    }
    
    return results;
  }
}

// Create singleton instance
const telegramScrapingJob = new TelegramScrapingJob();

module.exports = telegramScrapingJob;