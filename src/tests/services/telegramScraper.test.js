const TelegramScraper = require('../../services/TelegramScraper');
const Report = require('../../models/Report');
const { connectDB, closeDB } = require('../setup');
const fs = require('fs');
const yaml = require('js-yaml');

// Mock axios
jest.mock('axios');

// Mock HTML response for Telegram channel - will be generated dynamically
const getMockTelegramHTML = () => `
<!DOCTYPE html>
<html>
<body>
<div class="tgme_widget_message" data-post="testchannel/123">
  <div class="tgme_widget_message_text">قصف جوي استهدف مستشفى في حلب أدى إلى مقتل 5 مدنيين وإصابة 15 آخرين</div>
  <div class="tgme_widget_message_date">
    <a href="https://t.me/testchannel/123">
      <time datetime="${new Date().toISOString()}">Just now</time>
    </a>
  </div>
  <div class="tgme_widget_message_views">1.2K views</div>
</div>
<div class="tgme_widget_message" data-post="testchannel/124">
  <div class="tgme_widget_message_text">انفجار عبوة ناسفة في دمشق</div>
  <div class="tgme_widget_message_date">
    <a href="https://t.me/testchannel/124">
      <time datetime="${new Date(Date.now() - 60000).toISOString()}">1 minute ago</time>
    </a>
  </div>
  <div class="tgme_widget_message_views">892 views</div>
</div>
<div class="tgme_widget_message" data-post="testchannel/125">
  <div class="tgme_widget_message_text">Weather update: sunny day today with clear skies</div>
  <div class="tgme_widget_message_date">
    <a href="https://t.me/testchannel/125">
      <time datetime="${new Date(Date.now() - 120000).toISOString()}">2 minutes ago</time>
    </a>
  </div>
</div>
<div class="tgme_widget_message" data-post="testchannel/126">
  <div class="tgme_widget_message_text">اقتصاد: ارتفاع أسعار النفط اليوم</div>
  <div class="tgme_widget_message_date">
    <a href="https://t.me/testchannel/126">
      <time datetime="${new Date(Date.now() - 180000).toISOString()}">3 minutes ago</time>
    </a>
  </div>
</div>
<div class="tgme_widget_message" data-post="testchannel/127">
  <div class="tgme_widget_message_text">😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀</div>
  <div class="tgme_widget_message_date">
    <a href="https://t.me/testchannel/127">
      <time datetime="${new Date(Date.now() - 240000).toISOString()}">4 minutes ago</time>
    </a>
  </div>
</div>
<div class="tgme_widget_message" data-post="testchannel/128">
  <div class="tgme_widget_message_text">اعتقال 3 مدنيين في دمشق</div>
  <div class="tgme_widget_message_date">
    <a href="https://t.me/testchannel/128">
      <time datetime="${new Date(Date.now() - 300000).toISOString()}">5 minutes ago</time>
    </a>
  </div>
</div>
</body>
</html>
`;

describe('TelegramScraper', () => {
  let scraper;
  let mockHttpClient;

  beforeAll(async () => {
    await connectDB();
    
    // Create test configuration files
    const channelsConfig = {
      channels: [
        {
          name: 'testchannel',
          url: 'https://t.me/testchannel',
          description: 'Test Channel',
          active: true,
          priority: 'high',
          language: 'ar',
          filtering: {
            min_keyword_matches: 1,
            require_context_keywords: false,
            min_text_length: 30,
            exclude_patterns: []
          }
        },
        {
          name: 'mediumchannel',
          url: 'https://t.me/mediumchannel',
          description: 'Medium Priority Channel',
          active: true,
          priority: 'medium',
          language: 'ar',
          filtering: {
            min_keyword_matches: 2,
            require_context_keywords: true,
            min_text_length: 50,
            exclude_patterns: ['طقس', 'أحوال جوية', 'اقتصاد', 'سياسة']
          }
        }
      ],
      scraping: {
        interval: 5,
        lookback_window: 60,
        max_messages_per_channel: 50,
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
          max_number_ratio: 0.3
        },
        exclude_patterns: [
          'طقس', 'أحوال جوية', 'اقتصاد', 'سياسة', 'رياضة', 'ترفيه'
        ]
      }
    };

    const keywordsConfig = {
      keywords: {
        AIRSTRIKE: ['قصف جوي', 'غارة جوية'],
        EXPLOSION: ['انفجار', 'عبوة ناسفة'],
        SHELLING: ['قصف'],
        DETENTION: ['اعتقال']
      },
      context_keywords: ['مدنيين', 'مستشفى', 'أطفال'],
      location_keywords: ['حلب', 'دمشق', 'سوريا']
    };

    // Mock fs.readFileSync for configuration files
    const originalReadFileSync = fs.readFileSync;
    jest.spyOn(fs, 'readFileSync').mockImplementation((filePath, encoding) => {
      if (filePath.includes('telegram-channels.yaml')) {
        return yaml.dump(channelsConfig);
      } else if (filePath.includes('violation-keywords.yaml')) {
        return yaml.dump(keywordsConfig);
      }
      return originalReadFileSync(filePath, encoding);
    });

    scraper = new TelegramScraper();
    
    // Mock the HTTP client
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

  describe('Configuration Loading', () => {
    it('should load channels and keywords configuration', () => {
      expect(scraper.activeChannels).toHaveLength(2);
      expect(scraper.activeChannels[0].name).toBe('testchannel');
      expect(scraper.activeChannels[1].name).toBe('mediumchannel');
      expect(scraper.allKeywords.length).toBeGreaterThan(0);
      expect(scraper.allKeywords).toContain('قصف جوي');
      expect(scraper.allKeywords).toContain('مدنيين');
    });

    it('should load filtering configuration', () => {
      expect(scraper.filteringConfig).toBeDefined();
      expect(scraper.filteringConfig.global.min_keyword_matches).toBe(2);
      expect(scraper.filteringConfig.global.require_context_keywords).toBe(true);
      expect(scraper.filteringConfig.global.min_text_length).toBe(50);
      expect(scraper.filteringConfig.exclude_patterns).toContain('طقس');
    });
  });

  describe('Content Quality Filtering', () => {
    it('should pass quality content checks', () => {
      const goodText = 'قصف جوي استهدف مستشفى في حلب أدى إلى مقتل 5 مدنيين';
      const result = scraper.isQualityContent(goodText, 0.1, 0.2, 0.3);
      expect(result).toBe(true);
    });

    it('should fail quality checks for excessive emojis', () => {
      const emojiText = '😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀';
      const result = scraper.isQualityContent(emojiText, 0.1, 0.2, 0.3);
      expect(result).toBe(false);
    });

    it('should fail quality checks for excessive punctuation', () => {
      const punctuationText = '!!!!!@@@@@#####$$$$$%%%%%^^^^^&&&&&*****';
      const result = scraper.isQualityContent(punctuationText, 0.1, 0.2, 0.3);
      expect(result).toBe(false);
    });

    it('should fail quality checks for excessive numbers', () => {
      const numberText = '1234567890123456789012345678901234567890';
      const result = scraper.isQualityContent(numberText, 0.1, 0.2, 0.3);
      expect(result).toBe(false);
    });

    it('should pass quality checks for normal text with some emojis', () => {
      const mixedText = 'قصف جوي في حلب 😀 أدى إلى مقتل 5 مدنيين';
      const result = scraper.isQualityContent(mixedText, 0.1, 0.2, 0.3);
      expect(result).toBe(true);
    });
  });

  describe('Exclude Pattern Filtering', () => {
    it('should detect excluded patterns', () => {
      const weatherText = 'طقس اليوم مشمس';
      const result = scraper.containsExcludePatterns(weatherText, ['طقس']);
      expect(result).toBe(true);
    });

    it('should not detect excluded patterns in violation text', () => {
      const violationText = 'قصف جوي استهدف مستشفى في حلب';
      const result = scraper.containsExcludePatterns(violationText, ['طقس', 'اقتصاد']);
      expect(result).toBe(false);
    });

    it('should be case insensitive', () => {
      const mixedCaseText = 'الطقس اليوم مشمس';
      const result = scraper.containsExcludePatterns(mixedCaseText, ['طقس']);
      expect(result).toBe(true);
    });
  });

  describe('Enhanced Keyword Matching', () => {
    it('should find matching keywords with context requirement', () => {
      const text = 'قصف جوي استهدف مستشفى في حلب أدى إلى مقتل 5 مدنيين';
      const result = scraper.findMatchingKeywordsWithContext(text, true);
      
      expect(result.matchedKeywords).toContain('قصف جوي');
      expect(result.matchedKeywords).toContain('مستشفى');
      expect(result.matchedKeywords).toContain('مدنيين');
      expect(result.matchedKeywords).toContain('حلب');
    });

    it('should require context keywords when specified', () => {
      const text = 'قصف جوي في المنطقة'; // No context keywords
      const result = scraper.findMatchingKeywordsWithContext(text, true);
      
      expect(result.matchedKeywords).toHaveLength(0);
    });

    it('should not require context keywords when not specified', () => {
      const text = 'قصف جوي في المنطقة'; // No context keywords
      const result = scraper.findMatchingKeywordsWithContext(text, false);
      
      expect(result.matchedKeywords).toContain('قصف جوي');
    });

    it('should match location keywords as context', () => {
      const text = 'قصف جوي في دمشق';
      const result = scraper.findMatchingKeywordsWithContext(text, true);
      
      expect(result.matchedKeywords).toContain('قصف جوي');
      expect(result.matchedKeywords).toContain('دمشق');
    });
  });

  describe('Enhanced Filtering', () => {
    it('should pass filtering for high-quality violation content', () => {
      const channel = scraper.activeChannels[0]; // testchannel with lenient settings
      const text = 'قصف جوي استهدف مستشفى في حلب أدى إلى مقتل 5 مدنيين';
      
      const result = scraper.applyEnhancedFiltering(text, channel);
      
      expect(result.shouldImport).toBe(true);
      expect(result.matchedKeywords).toContain('قصف جوي');
      expect(result.reason).toBe('Passed all filters');
    });

    it('should fail filtering for short text', () => {
      const channel = scraper.activeChannels[0];
      const text = 'قصف جوي'; // Too short
      
      const result = scraper.applyEnhancedFiltering(text, channel);
      
      expect(result.shouldImport).toBe(false);
      expect(result.reason).toContain('Text too short');
    });

    it('should fail filtering for excluded patterns', () => {
      const channel = scraper.activeChannels[1]; // mediumchannel with exclude patterns
      const text = 'اقتصاد: ارتفاع أسعار النفط اليوم في سوريا وأسواق المنطقة العربية';
      
      const result = scraper.applyEnhancedFiltering(text, channel);
      
      expect(result.shouldImport).toBe(false);
      expect(result.reason).toBe('Contains excluded patterns');
    });

    it('should fail filtering for insufficient keyword matches', () => {
      const channel = scraper.activeChannels[1]; // mediumchannel requires 2 matches
      const text = 'قصف جوي في المنطقة العربية مع وجود بعض التقارير المتناقضة';
      
      const result = scraper.applyEnhancedFiltering(text, channel);
      
      expect(result.shouldImport).toBe(false);
      expect(result.reason).toContain('Insufficient keyword matches');
    });

    it('should pass filtering with sufficient keyword matches', () => {
      const channel = scraper.activeChannels[1]; // mediumchannel requires 2 matches
      const text = 'قصف جوي استهدف مدنيين في حلب وأدى إلى مقتل عدة أشخاص';
      
      const result = scraper.applyEnhancedFiltering(text, channel);
      
      expect(result.shouldImport).toBe(true);
      expect(result.matchedKeywords.length).toBeGreaterThanOrEqual(2);
    });

    it('should use global settings when channel settings are not specified', () => {
      const channel = { name: 'test', filtering: {} }; // No specific settings
      const text = 'قصف جوي في المنطقة العربية مع وجود بعض التقارير المتناقضة';
      
      const result = scraper.applyEnhancedFiltering(text, channel);
      
      expect(result.shouldImport).toBe(false);
      expect(result.reason).toContain('Insufficient keyword matches');
    });
  });

  describe('Channel Scraping with Enhanced Filtering', () => {
    it('should successfully scrape a channel and apply enhanced filtering', async () => {
      // Mock HTTP response
      mockHttpClient.get.mockResolvedValue({
        data: getMockTelegramHTML()
      });

      const channel = scraper.activeChannels[0]; // testchannel with lenient settings
      
      const result = await scraper.scrapeChannel(channel);

      // Should import violation reports but filter out non-violation content
      expect(result.newReports).toBeGreaterThan(0);
      expect(result.filtered).toBeGreaterThan(0);
      expect(result.processed).toBeGreaterThan(0);

      // Check if reports were saved to database
      const savedReports = await Report.find({});
      expect(savedReports.length).toBeGreaterThan(0);
      
      // Verify that filtered content was not saved
      const weatherReports = savedReports.filter(r => r.text.includes('طقس'));
      expect(weatherReports.length).toBe(0);
    }, 10000);

    it('should apply stricter filtering for medium priority channels', async () => {
      // Mock HTTP response with content that should be filtered
      const htmlWithMixedContent = `
        <!DOCTYPE html>
        <html>
        <body>
        <div class="tgme_widget_message" data-post="mediumchannel/123">
          <div class="tgme_widget_message_text">قصف جوي في المنطقة العربية مع وجود بعض التقارير المتناقضة حول الأحداث الجارية</div>
          <div class="tgme_widget_message_date">
            <a href="https://t.me/mediumchannel/123">
              <time datetime="${new Date().toISOString()}">Just now</time>
            </a>
          </div>
        </div>
        <div class="tgme_widget_message" data-post="mediumchannel/124">
          <div class="tgme_widget_message_text">قصف جوي استهدف مدنيين في حلب وأدى إلى مقتل عدة أشخاص وإصابة آخرين</div>
          <div class="tgme_widget_message_date">
            <a href="https://t.me/mediumchannel/124">
              <time datetime="${new Date().toISOString()}">Just now</time>
            </a>
          </div>
        </div>
        </body>
        </html>
      `;

      mockHttpClient.get.mockResolvedValue({
        data: htmlWithMixedContent
      });

      const channel = scraper.activeChannels[1]; // mediumchannel with strict settings
      
      const result = await scraper.scrapeChannel(channel);

      // First message should be filtered (insufficient keywords), second should pass
      expect(result.newReports).toBe(1);
      expect(result.filtered).toBe(1);
    }, 10000);

    it('should handle HTTP errors gracefully', async () => {
      mockHttpClient.get.mockRejectedValue(new Error('HTTP 500 Error'));

      const channel = scraper.activeChannels[0];
      
      await expect(scraper.scrapeChannel(channel)).rejects.toThrow('HTTP 500 Error');
    }, 5000);
  });

  describe('Language Detection', () => {
    it('should detect Arabic text', () => {
      const arabicText = 'قصف جوي استهدف مستشفى في حلب';
      const language = scraper.detectLanguage(arabicText);
      
      expect(language).toBe('ar');
    });

    it('should detect English text', () => {
      const englishText = 'This is an English sentence';
      const language = scraper.detectLanguage(englishText);
      
      expect(language).toBe('en');
    });

    it('should detect mixed language text', () => {
      const mixedText = 'Breaking news: قصف جوي في حلب';
      const language = scraper.detectLanguage(mixedText);
      
      expect(language).toBe('mixed');
    });
  });

  describe('Statistics and Metrics', () => {
    it('should track filtered content in scraping results', async () => {
      // Mock HTTP response
      mockHttpClient.get.mockResolvedValue({
        data: getMockTelegramHTML()
      });

      const result = await scraper.scrapeAllChannels();

      expect(result.filtered).toBeGreaterThan(0);
      expect(result.success).toBe(2); // Both channels should succeed
      expect(result.failed).toBe(0);
    }, 10000);
  });
});