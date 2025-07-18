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

      // Load filtering configuration
      this.filteringConfig = this.channelsConfig.filtering || {
        global: {
          min_keyword_matches: 2,
          require_context_keywords: true,
          min_text_length: 50,
          max_emoji_ratio: 0.1,
          max_punctuation_ratio: 0.2,
          max_number_ratio: 0.3
        },
        exclude_patterns: []
      };

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
      filtered: 0, // New metric for filtered content
      channels: []
    };

    logger.info(`Starting scraping for ${this.activeChannels.length} channels`);

    for (const channel of this.activeChannels) {
      try {
        const channelResult = await this.scrapeChannel(channel);
        results.success++;
        results.newReports += channelResult.newReports;
        results.duplicates += channelResult.duplicates;
        results.filtered += channelResult.filtered;
        results.channels.push({
          name: channel.name,
          status: 'success',
          ...channelResult
        });
        
        logger.info(`Scraped ${channel.name}: ${channelResult.newReports} new reports, ${channelResult.duplicates} duplicates, ${channelResult.filtered} filtered`);
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

    logger.info(`Scraping completed: ${results.success} successful, ${results.failed} failed, ${results.newReports} new reports, ${results.filtered} filtered`);
    return results;
  }

  /**
   * Scrape a specific channel
   */
  async scrapeChannel(channel) {
    const result = {
      newReports: 0,
      duplicates: 0,
      filtered: 0, // New metric
      regionFiltered: 0, // Regional filtering metric
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
          const messageData = await this.parseMessage(messageElement, channel);
          
          if (!messageData) {
            continue;
          }

          // Increment processed count here since we successfully parsed the message
          processedCount++;
          result.processed++;

          // Check if message is within our time window
          if (messageData.date < cutoffTime) {
            logger.debug(`Message too old, skipping: ${messageData.date}`);
            continue;
          }

          // Enhanced filtering with content quality checks
          const filteringResult = this.applyEnhancedFiltering(messageData.text, channel);
          
          if (!filteringResult.shouldImport) {
            result.filtered++;
            
            // Track region-based filtering specifically
            if (filteringResult.filterType === 'region') {
              result.regionFiltered++;
            }
            
            logger.debug(`Message filtered out: ${messageData.metadata.messageId} - ${filteringResult.reason}`);
            continue;
          }

          messageData.metadata.matchedKeywords = filteringResult.matchedKeywords;

          // Check if report already exists
          const existingReport = await Report.exists(channel.name, messageData.metadata.messageId);
          if (existingReport) {
            result.duplicates++;
            continue;
          }

          // Create new report
          const reportData = Report.sanitizeData(messageData);
          const report = new Report(reportData);
          await report.save();
          
          result.newReports++;
          logger.debug(`Saved new report: ${messageData.metadata.messageId} from ${channel.name}`);
          
        } catch (error) {
          result.errors.push(`Message parsing error: ${error.message}`);
          logger.error(`Error parsing message from ${channel.name}:`, error);
        }
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
  async parseMessage(messageElement, channel) {
    try {
      // Extract message ID from data attribute or href
      let messageLink = messageElement.find('.tgme_widget_message_date a').attr('href');
      if (!messageLink) {
        // Fallback to old structure if needed
        messageLink = messageElement.find('.tgme_widget_message_date').attr('href');
      }
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
   * Enhanced filtering with content quality checks
   */
  applyEnhancedFiltering(text, channel) {
    // Get channel-specific filtering settings or use global defaults
    const channelFiltering = channel.filtering || this.filteringConfig.global;
    const globalFiltering = this.filteringConfig.global;
    
    // Regional filtering - check FIRST before other expensive operations
    if (channel.assigned_regions && channelFiltering.enforce_region_filter) {
      const regionResult = this.checkRegionMatch(text, channel.assigned_regions);
      if (!regionResult.hasMatch) {
        return { 
          shouldImport: false, 
          reason: `No assigned region found. Channel covers: ${channel.assigned_regions.join(', ')}`,
          filterType: 'region'
        };
      }
    }
    
    // Use channel-specific settings if available, otherwise use global
    const minKeywordMatches = channelFiltering.min_keyword_matches || globalFiltering.min_keyword_matches;
    const requireContextKeywords = channelFiltering.require_context_keywords !== undefined ? 
      channelFiltering.require_context_keywords : globalFiltering.require_context_keywords;
    const minTextLength = channelFiltering.min_text_length || globalFiltering.min_text_length;
    const maxEmojiRatio = globalFiltering.max_emoji_ratio;
    const maxPunctuationRatio = globalFiltering.max_punctuation_ratio;
    const maxNumberRatio = globalFiltering.max_number_ratio;

    // Check text length
    if (text.length < minTextLength) {
      return { shouldImport: false, reason: `Text too short (${text.length} < ${minTextLength})` };
    }

    // Check content quality
    if (!this.isQualityContent(text, maxEmojiRatio, maxPunctuationRatio, maxNumberRatio)) {
      return { shouldImport: false, reason: 'Failed content quality checks' };
    }

    // Check for exclude patterns
    const excludePatterns = channelFiltering.exclude_patterns || this.filteringConfig.exclude_patterns || [];
    if (this.containsExcludePatterns(text, excludePatterns)) {
      return { shouldImport: false, reason: 'Contains excluded patterns' };
    }

    // Enhanced keyword matching
    const keywordResult = this.findMatchingKeywordsWithContext(text, requireContextKeywords);
    
    if (keywordResult.matchedKeywords.length < minKeywordMatches) {
      return { 
        shouldImport: false, 
        reason: `Insufficient keyword matches (${keywordResult.matchedKeywords.length} < ${minKeywordMatches})` 
      };
    }

    return {
      shouldImport: true,
      matchedKeywords: keywordResult.matchedKeywords,
      reason: 'Passed all filters'
    };
  }

  /**
   * Check if text mentions any of the assigned regions
   * @param {string} text - Message text
   * @param {Array} assignedRegions - Array of region names this channel covers
   * @returns {Object} - Match result with details
   */
  checkRegionMatch(text, assignedRegions) {
    const lowerText = text.toLowerCase();
    const matchedRegions = [];

    // Check for direct region mentions
    for (const region of assignedRegions) {
      if (lowerText.includes(region.toLowerCase())) {
        matchedRegions.push(region);
      }
    }

    // Check for region variations/aliases
    const regionAliases = this.getRegionAliases();
    for (const region of assignedRegions) {
      const aliases = regionAliases[region] || [];
      for (const alias of aliases) {
        if (lowerText.includes(alias.toLowerCase())) {
          matchedRegions.push(region);
          break;
        }
      }
    }

    return {
      hasMatch: matchedRegions.length > 0,
      matchedRegions: [...new Set(matchedRegions)], // Remove duplicates
      assignedRegions: assignedRegions
    };
  }

  /**
   * Get regional aliases and alternative names
   */
  getRegionAliases() {
    return {
      'دمشق': ['العاصمة', 'دمشق الشام', 'الشام', 'damascus'],
      'حلب': ['حلب الشهباء', 'aleppo', 'alep'],
      'حمص': ['حمص الأبية', 'homs'],
      'حماة': ['حماة الأسود', 'hama', 'hamah'],
      'درعا': ['درعا البلد', 'daraa', 'deraa'],
      'دير الزور': ['دير الزور الفيحاء', 'deir ez-zor', 'deir ezzor'],
      'السويداء': ['السويداء الكرامة', 'as-suwayda', 'sweida'],
      'القنيطرة': ['quneitra', 'qunaytirah'],
      'طرطوس': ['tartus', 'tartous'],
      'اللاذقية': ['latakia', 'lattakia'],
      'الرقة': ['raqqa', 'ar-raqqah'],
      'إدلب': ['idlib', 'idleb'],
      'الحسكة': ['al-hasakah', 'hasaka'],
      'ريف دمشق': ['ريف الشام', 'rif dimashq', 'damascus countryside', 'غوطة']
    };
  }

  /**
   * Check content quality based on various metrics
   */
  isQualityContent(text, maxEmojiRatio, maxPunctuationRatio, maxNumberRatio) {
    // Check emoji ratio
    const emojiCount = (text.match(/[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu) || []).length;
    if (emojiCount > text.length * maxEmojiRatio) {
      return false;
    }

    // Check punctuation ratio
    const punctuationCount = (text.match(/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/g) || []).length;
    if (punctuationCount > text.length * maxPunctuationRatio) {
      return false;
    }

    // Check number ratio
    const numberCount = (text.match(/\d/g) || []).length;
    if (numberCount > text.length * maxNumberRatio) {
      return false;
    }

    return true;
  }

  /**
   * Check if text contains exclude patterns
   */
  containsExcludePatterns(text, excludePatterns) {
    const lowerText = text.toLowerCase();
    return excludePatterns.some(pattern => lowerText.includes(pattern.toLowerCase()));
  }

  /**
   * Enhanced keyword matching with context requirements
   */
  findMatchingKeywordsWithContext(text, requireContextKeywords) {
    const lowerText = text.toLowerCase();
    const matched = [];
    const contextKeywords = this.keywordsConfig.context_keywords || [];
    const locationKeywords = this.keywordsConfig.location_keywords || [];
    
    // Find all matching keywords
    for (const keyword of this.allKeywords) {
      if (lowerText.includes(keyword.toLowerCase())) {
        matched.push(keyword);
      }
    }

    // If context keywords are required, check if at least one context keyword is present
    if (requireContextKeywords) {
      const hasContextKeyword = matched.some(keyword => 
        contextKeywords.includes(keyword) || locationKeywords.includes(keyword)
      );
      
      if (!hasContextKeyword) {
        return { matchedKeywords: [], reason: 'No context keywords found' };
      }
    }

    return { matchedKeywords: matched };
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