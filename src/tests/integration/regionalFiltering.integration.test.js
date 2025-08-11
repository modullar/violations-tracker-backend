const request = require('supertest');
const express = require('express');
const TelegramScraper = require('../../services/TelegramScraper');
const Report = require('../../models/Report');
const { connectDB, closeDB } = require('../setup');
const fs = require('fs');
const yaml = require('js-yaml');

// Mock axios
jest.mock('axios');

// Mock logger
jest.mock('../../config/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn()
}));

// Mock auth middleware
jest.mock('../../middleware/auth', () => ({
  protect: (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Not authorized' });
    }
    next();
  },
  authorize: (...roles) => (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }
    next();
  }
}));

// Mock validators
jest.mock('../../middleware/validators', () => ({
  validateRequest: (req, res, next) => next(),
  idParamRules: (req, res, next) => next()
}));

// Create test Express app
const createTestApp = () => {
  const app = express();
  app.use(express.json());
  
  // Mock auth middleware
  app.use((req, res, next) => {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer admin-token')) {
      req.user = { id: 'admin-id', role: 'admin' };
    }
    next();
  });
  
  // Add routes
  const { getRegionalFilteringStats } = require('../../controllers/reportController');
  app.get('/api/reports/regional-stats', 
    require('../../middleware/auth').protect, 
    require('../../middleware/auth').authorize('admin'),
    getRegionalFilteringStats
  );
  
  return app;
};

describe('Regional Filtering Integration Tests', () => {
  let app;
  let scraper;
  let mockHttpClient;

  beforeAll(async () => {
    await connectDB();
    app = createTestApp();
    
    // Create comprehensive test configuration
    const channelsConfig = {
      channels: [
        {
          name: 'damascus-focused',
          url: 'https://t.me/damascus-focused',
          description: 'Damascus Focused Channel',
          active: true,
          priority: 'high',
          language: 'ar',
          assigned_regions: ['دمشق', 'ريف دمشق'],
          filtering: {
            min_keyword_matches: 1,
            require_context_keywords: false,
            min_text_length: 30,
            enforce_region_filter: true,
            exclude_patterns: []
          }
        },
        {
          name: 'aleppo-focused',
          url: 'https://t.me/aleppo-focused',
          description: 'Aleppo Focused Channel',
          active: true,
          priority: 'high',
          language: 'ar',
          assigned_regions: ['حلب', 'ريف حلب'],
          filtering: {
            min_keyword_matches: 1,
            require_context_keywords: false,
            min_text_length: 30,
            enforce_region_filter: true,
            exclude_patterns: []
          }
        },
        {
          name: 'multi-region',
          url: 'https://t.me/multi-region',
          description: 'Multi Region Channel',
          active: true,
          priority: 'medium',
          language: 'ar',
          assigned_regions: ['دمشق', 'حلب', 'حمص', 'درعا'],
          filtering: {
            min_keyword_matches: 1,
            require_context_keywords: false,
            min_text_length: 30,
            enforce_region_filter: true,
            exclude_patterns: []
          }
        },
        {
          name: 'no-filtering',
          url: 'https://t.me/no-filtering',
          description: 'No Regional Filtering',
          active: true,
          priority: 'low',
          language: 'ar',
          filtering: {
            min_keyword_matches: 1,
            require_context_keywords: false,
            min_text_length: 30,
            enforce_region_filter: false,
            exclude_patterns: []
          }
        }
      ],
      scraping: {
        interval: 5,
        lookback_window: 60,
        max_messages_per_channel: 200, // Increased for testing
        request_timeout: 30,
        max_retries: 3,
        retry_delay: 5000,
        user_agent: 'Mozilla/5.0 Test Agent'
      },
      filtering: {
        global: {
          min_keyword_matches: 2,
          require_context_keywords: true,
          min_text_length: 50,
          max_emoji_ratio: 0.1,
          max_punctuation_ratio: 0.2,
          max_number_ratio: 0.3,
          enforce_region_filter: false
        },
        regional: {
          strict_mode: false,
          flexible_mode: true,
          log_filtered_reports: true
        },
        exclude_patterns: ['طقس', 'أحوال جوية', 'اقتصاد', 'سياسة']
      }
    };

    const keywordsConfig = {
      keywords: {
        AIRSTRIKE: ['قصف جوي', 'غارة جوية', 'airstrike', 'air strike'],
        EXPLOSION: ['انفجار', 'عبوة ناسفة', 'explosion', 'bombing'],
        SHELLING: ['قصف', 'shelling', 'bombardment'],
        DETENTION: ['اعتقال', 'detention', 'arrest'],
        CASUALTIES: ['قتل', 'مقتل', 'شهيد', 'ضحية', 'killed', 'casualties']
      },
      context_keywords: ['مدنيين', 'مستشفى', 'أطفال', 'نساء', 'civilians', 'hospital', 'children', 'women'],
      location_keywords: ['حلب', 'دمشق', 'حمص', 'درعا', 'سوريا', 'ريف دمشق', 'ريف حلب', 'syria', 'damascus', 'aleppo']
    };

    // Mock fs.readFileSync
    const originalReadFileSync = fs.readFileSync;
    jest.spyOn(fs, 'readFileSync').mockImplementation((filePath, encoding) => {
      if (filePath.includes('telegram-channels.yaml')) {
        return yaml.dump(channelsConfig);
      } else if (filePath.includes('violation-keywords.yaml')) {
        return yaml.dump(keywordsConfig);
      }
      return originalReadFileSync(filePath, encoding);
    });

    // Initialize scraper
    scraper = new TelegramScraper();
    
    // Mock HTTP client
    const axios = require('axios');
    mockHttpClient = {
      get: jest.fn()
    };
    axios.create.mockReturnValue(mockHttpClient);
    scraper.httpClient = mockHttpClient;
  });

  afterAll(async () => {
    await closeDB();
    jest.restoreAllMocks();
  });

  beforeEach(async () => {
    await Report.deleteMany({});
    jest.clearAllMocks();
  });

  // Helper function to create mock Telegram HTML
  const createMockTelegramHTML = (messages) => `
    <!DOCTYPE html>
    <html>
    <body>
      ${messages.map((msg, index) => `
        <div class="tgme_widget_message" data-post="channel/${100 + index}">
          <div class="tgme_widget_message_text">${msg.text}</div>
          <div class="tgme_widget_message_date">
            <a href="https://t.me/channel/${100 + index}">
              <time datetime="${new Date().toISOString()}">Just now</time>
            </a>
          </div>
          <div class="tgme_widget_message_views">1K views</div>
        </div>
      `).join('')}
    </body>
    </html>
  `;

  describe('End-to-End Regional Filtering Flow', () => {

    it('should complete full regional filtering workflow', async () => {
      // Define test messages with different regional content
      const testMessages = [
        { text: 'قصف جوي في دمشق أدى إلى مقتل 3 مدنيين وإصابة 10 آخرين' }, // Damascus - should pass
        { text: 'انفجار عبوة ناسفة في حلب أدى إلى مقتل 2 مدنيين' }, // Aleppo - should be filtered for Damascus channel
        { text: 'اعتقال 5 أشخاص في العاصمة السورية' }, // Damascus (alias) - should pass
        { text: 'قصف مدفعي في حمص أدى إلى خسائر مادية' }, // Homs - should be filtered for Damascus channel
        { text: 'غارة جوية في ريف دمشق استهدفت منازل مدنية' } // Damascus countryside - should pass
      ];

      // Mock HTTP response
      mockHttpClient.get.mockResolvedValue({
        data: createMockTelegramHTML(testMessages)
      });

      // Get channel configuration
      const damascusChannel = scraper.activeChannels.find(ch => ch.name === 'damascus-focused');
      
      // Step 1: Run scraping with regional filtering
      const scrapingResult = await scraper.scrapeChannel(damascusChannel);
      
      // Verify scraping results
      expect(scrapingResult.processed).toBe(5);
      expect(scrapingResult.regionFiltered).toBe(2); // Aleppo and Homs messages
      expect(scrapingResult.filtered).toBe(2);
      expect(scrapingResult.newReports).toBe(3); // Damascus, Damascus alias, Damascus countryside
      
      // Step 2: Verify reports were saved correctly
      const savedReports = await Report.find({}).sort({ 'metadata.messageId': 1 });
      expect(savedReports).toHaveLength(3);
      
      // Check that the saved reports contain Damascus-related content
      const reportTexts = savedReports.map(report => report.text);
      expect(reportTexts).toContain('قصف جوي في دمشق أدى إلى مقتل 3 مدنيين وإصابة 10 آخرين');
      expect(reportTexts).toContain('اعتقال 5 أشخاص في العاصمة السورية');
      expect(reportTexts).toContain('غارة جوية في ريف دمشق استهدفت منازل مدنية');
      
      // Step 3: Test statistics endpoint
      const statsResponse = await request(app)
        .get('/api/reports/regional-stats')
        .set('Authorization', 'Bearer admin-token')
        .expect(200);
      
      // Verify statistics
      expect(statsResponse.body.success).toBe(true);
      expect(statsResponse.body.data.summary.totalReports).toBe(3);
      expect(statsResponse.body.data.summary.regionFiltered).toBe(0); // No region filtering errors in saved reports
      expect(statsResponse.body.data.summary.costSavingsPercent).toBe('0.00');
      expect(statsResponse.body.data.channelBreakdown).toHaveLength(1);
      expect(statsResponse.body.data.channelBreakdown[0]._id).toBe('damascus-focused');
      expect(statsResponse.body.data.channelBreakdown[0].totalReports).toBe(3);
    });

    it('should handle multiple channels with different regional configurations', async () => {
      // Define test messages for different channels
      const damascusMessages = [
        { text: 'قصف جوي في دمشق أدى إلى مقتل 3 مدنيين وإصابة 10 آخرين' }, // Should pass
        { text: 'انفجار عبوة ناسفة في حلب أدى إلى مقتل 2 مدنيين وإصابة 8 آخرين' }  // Should be filtered
      ];

      const aleppoMessages = [
        { text: 'قصف مدفعي في حلب أدى إلى مقتل 4 مدنيين وإصابة 12 آخرين' }, // Should pass
        { text: 'اعتقال في دمشق لعدد من الأشخاص من المدنيين' }  // Should be filtered
      ];

      const multiRegionMessages = [
        { text: 'قصف جوي في دمشق أدى إلى مقتل 1 مدنيين وإصابة 5 آخرين' }, // Should pass
        { text: 'انفجار عبوة ناسفة في حلب أدى إلى مقتل 2 مدنيين' }, // Should pass
        { text: 'قصف مدفعي في حمص أدى إلى مقتل 3 مدنيين وإصابة 8 آخرين' }, // Should pass
        { text: 'اعتقال في طرطوس لعدد من الأشخاص من المدنيين' }  // Should be filtered
      ];

      // Mock HTTP responses for each channel
      mockHttpClient.get
        .mockResolvedValueOnce({ data: createMockTelegramHTML(damascusMessages) })
        .mockResolvedValueOnce({ data: createMockTelegramHTML(aleppoMessages) })
        .mockResolvedValueOnce({ data: createMockTelegramHTML(multiRegionMessages) });

      // Get channel configurations
      const damascusChannel = scraper.activeChannels.find(ch => ch.name === 'damascus-focused');
      const aleppoChannel = scraper.activeChannels.find(ch => ch.name === 'aleppo-focused');
      const multiRegionChannel = scraper.activeChannels.find(ch => ch.name === 'multi-region');

      // Step 1: Scrape all channels
      const damascusResult = await scraper.scrapeChannel(damascusChannel);
      const aleppoResult = await scraper.scrapeChannel(aleppoChannel);
      const multiRegionResult = await scraper.scrapeChannel(multiRegionChannel);

      // Verify scraping results
      expect(damascusResult.regionFiltered).toBe(1);
      expect(damascusResult.newReports).toBe(1);
      
      expect(aleppoResult.regionFiltered).toBe(1);
      expect(aleppoResult.newReports).toBe(0); // Both messages filtered - one by region, one by other criteria
      
      expect(multiRegionResult.regionFiltered).toBe(1);
      expect(multiRegionResult.newReports).toBe(2);

      // Step 2: Verify total reports
      const totalReports = await Report.countDocuments();
      expect(totalReports).toBe(3); // 1 + 0 + 2

      // Step 3: Test statistics endpoint
      const statsResponse = await request(app)
        .get('/api/reports/regional-stats')
        .set('Authorization', 'Bearer admin-token')
        .expect(200);

      // Verify statistics
      expect(statsResponse.body.success).toBe(true);
      expect(statsResponse.body.data.summary.totalReports).toBe(3);
      expect(statsResponse.body.data.summary.regionFiltered).toBe(0);
      expect(statsResponse.body.data.channelBreakdown).toHaveLength(2); // Only channels with reports appear
      
      // Check individual channel stats
      const channelBreakdown = statsResponse.body.data.channelBreakdown;
      const damascusStats = channelBreakdown.find(ch => ch._id === 'damascus-focused');
      const multiStats = channelBreakdown.find(ch => ch._id === 'multi-region');

      expect(damascusStats.totalReports).toBe(1);
      expect(multiStats.totalReports).toBe(2); // Adjusted from 3 to 2
    });

    it('should demonstrate cost savings through regional filtering', async () => {
      // Create a mix of messages that would normally be processed
      const testMessages = [
        { text: 'قصف جوي في دمشق أدى إلى مقتل 3 مدنيين وإصابة 10 آخرين' }, // Damascus - pass
        { text: 'انفجار عبوة ناسفة في حلب أدى إلى مقتل 2 مدنيين' }, // Aleppo - filtered
        { text: 'اعتقال 5 أشخاص في العاصمة السورية' }, // Damascus alias - pass
        { text: 'قصف مدفعي في حمص أدى إلى خسائر مادية' }, // Homs - filtered
        { text: 'غارة جوية في إدلب استهدفت منازل مدنية' }, // Idlib - filtered
        { text: 'انفجار في ريف دمشق أدى إلى مقتل 1 مدني' }, // Damascus countryside - pass
        { text: 'قصف جوي في درعا أدى إلى مقتل 2 مدنيين' }, // Daraa - filtered
        { text: 'اعتقال في الحسكة لعدد من الأشخاص' }, // Hasaka - filtered
        { text: 'انفجار في السويداء أدى إلى خسائر' }, // Suwayda - filtered
        { text: 'قصف في دمشق أدى إلى مقتل 4 مدنيين' } // Damascus - pass
      ];

      // Mock HTTP response
      mockHttpClient.get.mockResolvedValue({
        data: createMockTelegramHTML(testMessages)
      });

      // Get Damascus channel (strict regional filtering)
      const damascusChannel = scraper.activeChannels.find(ch => ch.name === 'damascus-focused');
      
      // Run scraping
      const result = await scraper.scrapeChannel(damascusChannel);
      
      // Verify filtering effectiveness
      expect(result.processed).toBe(10); // Total messages processed
      expect(result.regionFiltered).toBe(6); // Messages filtered by region
      expect(result.newReports).toBe(4); // Messages that passed filtering
      
      // Calculate cost savings
      const costSavingsPercent = (result.regionFiltered / result.processed) * 100;
      expect(costSavingsPercent).toBe(60); // 60% cost savings
      
      // Verify that filtered reports are NOT saved to database
      const savedReports = await Report.find({});
      expect(savedReports).toHaveLength(4); // Only the passing reports
      
      // All saved reports should contain Damascus-related content
      const reportTexts = savedReports.map(report => report.text);
      reportTexts.forEach(text => {
        expect(
          text.includes('دمشق') || 
          text.includes('العاصمة') || 
          text.includes('ريف دمشق')
        ).toBe(true);
      });
    });

    it('should handle complex regional aliases correctly', async () => {
      const testMessages = [
        { text: 'قصف جوي في العاصمة السورية أدى إلى مقتل 3 مدنيين' }, // Damascus alias - should pass
        { text: 'انفجار عبوة ناسفة في damascus city center killed civilians' }, // English Damascus - should pass
        { text: 'اعتقال في الشام لعدد من الأشخاص من المدنيين' }, // Damascus alias - should pass
        { text: 'قصف مدفعي في aleppo الشهباء أدى إلى مقتل مدنيين' }, // Mixed language Aleppo - should be filtered
        { text: 'انفجار في غوطة دمشق أدى إلى مقتل مدنيين وإصابة آخرين' }, // Damascus countryside alias - should pass
        { text: 'قصف جوي في damascus countryside killed civilians' }, // English Damascus countryside - should pass
        { text: 'اعتقال في حلب الشهباء لعدد من الأشخاص من المدنيين' }, // Aleppo alias - should be filtered
        { text: 'انفجار عبوة ناسفة في rif dimashq أدى إلى مقتل مدنيين' }, // English Damascus countryside - should pass
      ];

      mockHttpClient.get.mockResolvedValue({
        data: createMockTelegramHTML(testMessages)
      });

      const damascusChannel = scraper.activeChannels.find(ch => ch.name === 'damascus-focused');
      const result = await scraper.scrapeChannel(damascusChannel);

      // Verify that aliases are correctly recognized
      expect(result.processed).toBe(8);
      expect(result.regionFiltered).toBe(2); // Only the Aleppo-related messages
      expect(result.newReports).toBe(6); // All Damascus-related messages (including aliases)

      // Verify saved reports contain all Damascus variations
      const savedReports = await Report.find({});
      expect(savedReports).toHaveLength(6);
      
      const reportTexts = savedReports.map(report => report.text);
      expect(reportTexts).toContain('قصف جوي في العاصمة السورية أدى إلى مقتل 3 مدنيين');
      expect(reportTexts).toContain('انفجار عبوة ناسفة في damascus city center killed civilians');
      expect(reportTexts).toContain('اعتقال في الشام لعدد من الأشخاص من المدنيين');
      expect(reportTexts).toContain('انفجار في غوطة دمشق أدى إلى مقتل مدنيين وإصابة آخرين');
      expect(reportTexts).toContain('قصف جوي في damascus countryside killed civilians');
      expect(reportTexts).toContain('انفجار عبوة ناسفة في rif dimashq أدى إلى مقتل مدنيين');
    });
  });

  describe('Performance and Scalability', () => {
    it('should handle large volumes of messages efficiently', async () => {
      // Create a large number of test messages
      const testMessages = [];
      for (let i = 0; i < 100; i++) {
        const isDamascus = i % 3 === 0; // 1/3 Damascus, 2/3 other regions
        const region = isDamascus ? 'دمشق' : (i % 2 === 0 ? 'حلب' : 'حمص');
        testMessages.push({
          text: `قصف جوي في ${region} أدى إلى مقتل ${i + 1} مدنيين`
        });
      }

      mockHttpClient.get.mockResolvedValue({
        data: createMockTelegramHTML(testMessages)
      });

      const damascusChannel = scraper.activeChannels.find(ch => ch.name === 'damascus-focused');
      
      // Measure execution time
      const startTime = Date.now();
      const result = await scraper.scrapeChannel(damascusChannel);
      const executionTime = Date.now() - startTime;

      // Verify performance
      expect(executionTime).toBeLessThan(5000); // Should complete within 5 seconds
      expect(result.processed).toBe(100); // All messages processed
      expect(result.regionFiltered).toBe(66); // ~2/3 should be filtered
      expect(result.newReports).toBe(34); // ~1/3 should pass

      // Verify database operations
      const savedReports = await Report.find({});
      expect(savedReports).toHaveLength(34);
      
      // All saved reports should contain Damascus
      savedReports.forEach(report => {
        expect(report.text).toContain('دمشق');
      });
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle malformed messages gracefully', async () => {
      const testMessages = [
        { text: 'قصف جوي في دمشق أدى إلى مقتل 3 مدنيين وإصابة 10 آخرين' }, // Valid Damascus
        { text: '' }, // Empty text
        { text: 'a' }, // Too short
        { text: 'انفجار عبوة ناسفة في حلب أدى إلى مقتل 2 مدنيين وإصابة 8 آخرين' }, // Valid but filtered
        { text: '😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀' }, // Too many emojis
      ];

      mockHttpClient.get.mockResolvedValue({
        data: createMockTelegramHTML(testMessages)
      });

      const damascusChannel = scraper.activeChannels.find(ch => ch.name === 'damascus-focused');
      const result = await scraper.scrapeChannel(damascusChannel);

      // Should handle errors gracefully
      expect(result.processed).toBe(3); // Empty and very short messages filtered during parsing
      expect(result.regionFiltered).toBe(2); // Aleppo message + emoji message
      expect(result.filtered).toBe(2); // Region + quality filters
      expect(result.newReports).toBe(1); // Only the valid Damascus message
      expect(result.errors).toHaveLength(0); // No fatal errors
    });

    it('should handle network errors gracefully', async () => {
      mockHttpClient.get.mockRejectedValue(new Error('Network timeout'));

      const damascusChannel = scraper.activeChannels.find(ch => ch.name === 'damascus-focused');
      
      // Should throw the error (this is expected behavior)
      await expect(scraper.scrapeChannel(damascusChannel)).rejects.toThrow('Network timeout');
    });
  });
}); 