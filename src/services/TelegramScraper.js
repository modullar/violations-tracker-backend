const axios = require('axios');
const cheerio = require('cheerio');
const yaml = require('js-yaml');
const fs = require('fs');
const path = require('path');
const logger = require('../config/logger');
const Report = require('../models/Report');

class TelegramScraper {
  constructor() {
    this.loadConfiguration();
    this.setupAxiosDefaults();
  }

  /**
   * Load configuration from YAML files
   */
  loadConfiguration() {
    try {
      // Load channels configuration
      const channelsPath = path.join(__dirname, '../config/telegram-channels.yaml');
      const channelsData = fs.readFileSync(channelsPath, 'utf8');
      this.channelsConfig = yaml.load(channelsData);

      // Load keywords configuration
      const keywordsPath = path.join(__dirname, '../config/violation-keywords.yaml');
      const keywordsData = fs.readFileSync(keywordsPath, 'utf8');
      this.keywordsConfig = yaml.load(keywordsData);

      // Extract active channels
      this.activeChannels = this.channelsConfig.channels.filter(channel => channel.active);
      
      // Combine all keywords for matching
      this.allKeywords = [];
      Object.keys(this.keywordsConfig.keywords).forEach(violationType => {
        this.allKeywords.push(...this.keywordsConfig.keywords[violationType]);
      });
      
      // Add context and location keywords
      if (this.keywordsConfig.context_keywords) {
        this.allKeywords.push(...this.keywordsConfig.context_keywords);
      }
      if (this.keywordsConfig.location_keywords) {
        this.allKeywords.push(...this.keywordsConfig.location_keywords);
      }

      logger.info(`Loaded ${this.activeChannels.length} active channels and ${this.allKeywords.length} keywords`);
    } catch (error) {
      logger.error('Error loading configuration:', error);
      throw error;
    }
  }

  /**
   * Setup axios defaults for web scraping
   */
  setupAxiosDefaults() {
    this.httpClient = axios.create({
      timeout: this.channelsConfig.scraping.request_timeout * 1000,
      headers: {
        'User-Agent': this.channelsConfig.scraping.user_agent,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'ar,en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1'
      }
    });
  }

  /**
   * Scrape all active channels
   */
  async scrapeAllChannels() {
    const results = {
      success: 0,
      failed: 0,
      newReports: 0,
      duplicates: 0,
      channels: []
    };

    logger.info(`Starting scraping for ${this.activeChannels.length} channels`);

    for (const channel of this.activeChannels) {
      try {
        const channelResult = await this.scrapeChannel(channel);
        results.success++;
        results.newReports += channelResult.newReports;
        results.duplicates += channelResult.duplicates;
        results.channels.push({
          name: channel.name,
          status: 'success',
          ...channelResult
        });
        
        logger.info(`Scraped ${channel.name}: ${channelResult.newReports} new reports, ${channelResult.duplicates} duplicates`);
      } catch (error) {
        results.failed++;
        results.channels.push({
          name: channel.name,
          status: 'failed',
          error: error.message
        });
        
        logger.error(`Failed to scrape ${channel.name}:`, error);
      }

      // Add delay between channel scraping to be respectful
      await this.delay(2000);
    }

    logger.info(`Scraping completed: ${results.success} successful, ${results.failed} failed, ${results.newReports} new reports`);
    return results;
  }

  /**
   * Scrape a specific channel
   */
  async scrapeChannel(channel) {
    const result = {
      newReports: 0,
      duplicates: 0,
      processed: 0,
      errors: []
    };

    try {
      // Construct the web version URL
      const webUrl = channel.url.replace('https://t.me/', 'https://t.me/s/');
      
      logger.debug(`Scraping channel: ${channel.name} from ${webUrl}`);

      const response = await this.httpClient.get(webUrl);
      const $ = cheerio.load(response.data);

      // Find message containers
      const messages = $('.tgme_widget_message');
      const cutoffTime = new Date(Date.now() - (this.channelsConfig.scraping.lookback_window * 60 * 1000));

      let processedCount = 0;
      const maxMessages = this.channelsConfig.scraping.max_messages_per_channel;

      for (let i = 0; i < messages.length && processedCount < maxMessages; i++) {
        const messageElement = messages.eq(i);
        
        try {
          const messageData = await this.parseMessage(messageElement, channel, $);
          
          if (!messageData) {
            continue;
          }

          // Check if message is within our time window
          if (messageData.date < cutoffTime) {
            logger.debug(`Message too old, skipping: ${messageData.date}`);
            continue;
          }

          // Check for keywords
          const matchedKeywords = this.findMatchingKeywords(messageData.text);
          if (matchedKeywords.length === 0) {
            logger.debug(`No keywords matched for message ${messageData.messageId}`);
            continue;
          }

          messageData.metadata.matchedKeywords = matchedKeywords;

          // Check if report already exists
          const existingReport = await Report.exists(channel.name, messageData.messageId);
          if (existingReport) {
            result.duplicates++;
            continue;
          }

          // Create new report
          const reportData = Report.sanitizeData(messageData);
          const report = new Report(reportData);
          await report.save();
          
          result.newReports++;
          logger.debug(`Saved new report: ${messageData.messageId} from ${channel.name}`);
          
        } catch (error) {
          result.errors.push(`Message parsing error: ${error.message}`);
          logger.error(`Error parsing message from ${channel.name}:`, error);
        }

        processedCount++;
        result.processed++;
      }

    } catch (error) {
      logger.error(`Error scraping channel ${channel.name}:`, error);
      throw error;
    }

    return result;
  }

  /**
   * Parse a single message element
   */
  async parseMessage(messageElement, channel, $) {
    try {
      // Extract message ID from data attribute or href
      const messageLink = messageElement.find('.tgme_widget_message_date').attr('href');
      if (!messageLink) {
        return null;
      }

      const messageId = messageLink.split('/').pop();
      if (!messageId) {
        return null;
      }

      // Extract message text
      const messageBody = messageElement.find('.tgme_widget_message_text');
      let text = '';
      
      if (messageBody.length > 0) {
        // Get text content, preserving some structure
        text = messageBody.text().trim();
      }

      // Skip if text is too short or empty
      if (!text || text.length < 10) {
        return null;
      }

      // Extract date
      const dateElement = messageElement.find('.tgme_widget_message_date time');
      let messageDate = new Date();
      
      if (dateElement.length > 0) {
        const datetime = dateElement.attr('datetime');
        if (datetime) {
          messageDate = new Date(datetime);
        }
      }

      // Extract additional metadata
      const viewsElement = messageElement.find('.tgme_widget_message_views');
      const viewCount = viewsElement.length > 0 ? 
        parseInt(viewsElement.text().replace(/[^\d]/g, '')) || 0 : 0;

      // Count media elements
      const mediaElements = messageElement.find('.tgme_widget_message_photo, .tgme_widget_message_video, .tgme_widget_message_document');
      const mediaCount = mediaElements.length;

      // Check for forwarded message
      const forwardedElement = messageElement.find('.tgme_widget_message_forwarded_from');
      const forwardedFrom = forwardedElement.length > 0 ? 
        forwardedElement.find('.tgme_widget_message_forwarded_from_name').text().trim() : null;

      // Detect language (simple heuristic)
      const language = this.detectLanguage(text);

      return {
        source_url: messageLink,
        text: text.substring(0, 10000), // Truncate if too long
        date: messageDate,
        parsedByLLM: false,
        metadata: {
          channel: channel.name,
          messageId: messageId,
          scrapedAt: new Date(),
          matchedKeywords: [], // Will be filled later
          language: language,
          mediaCount: mediaCount,
          forwardedFrom: forwardedFrom,
          viewCount: viewCount
        }
      };

    } catch (error) {
      logger.error('Error parsing message:', error);
      return null;
    }
  }

  /**
   * Find matching keywords in text
   */
  findMatchingKeywords(text) {
    const lowerText = text.toLowerCase();
    const matched = [];

    for (const keyword of this.allKeywords) {
      if (lowerText.includes(keyword.toLowerCase())) {
        matched.push(keyword);
      }
    }

    return matched;
  }

  /**
   * Simple language detection
   */
  detectLanguage(text) {
    // Count Arabic characters
    const arabicChars = (text.match(/[\u0600-\u06FF]/g) || []).length;
    const totalChars = text.length;
    
    if (arabicChars > totalChars * 0.7) {
      return 'ar';
    } else if (arabicChars > totalChars * 0.1) {
      return 'mixed';
    } else if (/[a-zA-Z]/.test(text)) {
      return 'en';
    }
    
    return 'unknown';
  }

  /**
   * Get violation type based on matched keywords
   */
  getViolationType(keywords) {
    for (const [violationType, violationKeywords] of Object.entries(this.keywordsConfig.keywords)) {
      for (const keyword of keywords) {
        if (violationKeywords.includes(keyword)) {
          return violationType;
        }
      }
    }
    return 'OTHER';
  }

  /**
   * Utility function to add delay
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get scraper statistics
   */
  async getStats() {
    const totalReports = await Report.countDocuments();
    const recentReports = await Report.countDocuments({
      'metadata.scrapedAt': { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
    });
    const unparsedReports = await Report.countDocuments({ parsedByLLM: false });

    const channelStats = [];
    for (const channel of this.activeChannels) {
      const count = await Report.countDocuments({ 'metadata.channel': channel.name });
      channelStats.push({
        channel: channel.name,
        reports: count
      });
    }

    return {
      totalReports,
      recentReports,
      unparsedReports,
      activeChannels: this.activeChannels.length,
      channelStats
    };
  }

  /**
   * Test connectivity to a specific channel
   */
  async testChannel(channelName) {
    const channel = this.activeChannels.find(c => c.name === channelName);
    if (!channel) {
      throw new Error(`Channel ${channelName} not found`);
    }

    try {
      const webUrl = channel.url.replace('https://t.me/', 'https://t.me/s/');
      const response = await this.httpClient.get(webUrl);
      
      return {
        channel: channel.name,
        url: webUrl,
        status: response.status,
        accessible: response.status === 200,
        responseTime: Date.now() - Date.now() // This would need to be measured properly
      };
    } catch (error) {
      return {
        channel: channel.name,
        accessible: false,
        error: error.message
      };
    }
  }
}

module.exports = TelegramScraper;