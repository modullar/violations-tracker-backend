const TelegramScraper = require('../../services/TelegramScraper');
const Report = require('../../models/Report');
const { connectDB, closeDB } = require('../setup');
const fs = require('fs');
const yaml = require('js-yaml');

// Mock axios
jest.mock('axios');

describe('TelegramScraper - Regional Filtering', () => {
  let scraper;
  let mockHttpClient;

  beforeAll(async () => {
    await connectDB();
    
    // Create test configuration files with regional filtering
    const channelsConfig = {
      channels: [
        {
          name: 'damascus-channel',
          url: 'https://t.me/damascus-channel',
          description: 'Damascus Channel',
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
          name: 'aleppo-channel',
          url: 'https://t.me/aleppo-channel',
          description: 'Aleppo Channel',
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
          name: 'no-region-channel',
          url: 'https://t.me/no-region-channel',
          description: 'No Region Channel',
          active: true,
          priority: 'medium',
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
        DETENTION: ['اعتقال', 'detention', 'arrest']
      },
      context_keywords: ['مدنيين', 'مستشفى', 'أطفال', 'civilians', 'hospital', 'children'],
      location_keywords: ['حلب', 'دمشق', 'سوريا', 'ريف دمشق', 'ريف حلب', 'syria', 'damascus', 'aleppo']
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

  describe('checkRegionMatch', () => {
    it('should match direct region mentions', () => {
      const text = 'قصف جوي في دمشق أدى إلى مقتل 5 مدنيين';
      const assignedRegions = ['دمشق', 'ريف دمشق'];
      
      const result = scraper.checkRegionMatch(text, assignedRegions);
      
      expect(result.hasMatch).toBe(true);
      expect(result.matchedRegions).toContain('دمشق');
      expect(result.assignedRegions).toEqual(assignedRegions);
    });

    it('should match region aliases', () => {
      const text = 'انفجار في العاصمة السورية';
      const assignedRegions = ['دمشق', 'ريف دمشق'];
      
      const result = scraper.checkRegionMatch(text, assignedRegions);
      
      expect(result.hasMatch).toBe(true);
      expect(result.matchedRegions).toContain('دمشق');
    });

    it('should match English region names', () => {
      const text = 'Airstrike in damascus targeted civilian buildings';
      const assignedRegions = ['دمشق'];
      
      const result = scraper.checkRegionMatch(text, assignedRegions);
      
      expect(result.hasMatch).toBe(true);
      expect(result.matchedRegions).toContain('دمشق');
    });

    it('should not match unassigned regions', () => {
      const text = 'قصف جوي في حلب أدى إلى مقتل 3 مدنيين';
      const assignedRegions = ['دمشق', 'ريف دمشق'];
      
      const result = scraper.checkRegionMatch(text, assignedRegions);
      
      expect(result.hasMatch).toBe(false);
      expect(result.matchedRegions).toHaveLength(0);
    });

    it('should handle case insensitive matching', () => {
      const text = 'AIRSTRIKE IN DAMASCUS CITY CENTER';
      const assignedRegions = ['دمشق'];
      
      const result = scraper.checkRegionMatch(text, assignedRegions);
      
      expect(result.hasMatch).toBe(true);
      expect(result.matchedRegions).toContain('دمشق');
    });

    it('should return unique matches when multiple aliases match', () => {
      const text = 'قصف في دمشق العاصمة الشام';
      const assignedRegions = ['دمشق'];
      
      const result = scraper.checkRegionMatch(text, assignedRegions);
      
      expect(result.hasMatch).toBe(true);
      expect(result.matchedRegions).toEqual(['دمشق']);
    });
  });

  describe('getRegionAliases', () => {
    it('should return comprehensive aliases for Syrian regions', () => {
      const aliases = scraper.getRegionAliases();
      
      expect(aliases).toHaveProperty('دمشق');
      expect(aliases['دمشق']).toContain('العاصمة');
      expect(aliases['دمشق']).toContain('damascus');
      
      expect(aliases).toHaveProperty('حلب');
      expect(aliases['حلب']).toContain('aleppo');
      expect(aliases['حلب']).toContain('حلب الشهباء');
    });

    it('should include countryside variations', () => {
      const aliases = scraper.getRegionAliases();
      
      expect(aliases).toHaveProperty('ريف دمشق');
      expect(aliases['ريف دمشق']).toContain('damascus countryside');
      expect(aliases['ريف دمشق']).toContain('غوطة');
    });
  });

  describe('applyEnhancedFiltering with regional filtering', () => {
    it('should filter out reports when region filtering is enabled and no match', () => {
      const text = 'قصف جوي في حلب أدى إلى مقتل 5 مدنيين';
      const channel = {
        name: 'damascus-channel',
        assigned_regions: ['دمشق', 'ريف دمشق'],
        filtering: {
          min_keyword_matches: 1,
          require_context_keywords: false,
          min_text_length: 30,
          enforce_region_filter: true,
          exclude_patterns: []
        }
      };
      
      const result = scraper.applyEnhancedFiltering(text, channel);
      
      expect(result.shouldImport).toBe(false);
      expect(result.filterType).toBe('region');
      expect(result.reason).toContain('No assigned region found');
      expect(result.reason).toContain('دمشق, ريف دمشق');
    });

    it('should pass reports when region filtering is enabled and match found', () => {
      const text = 'قصف جوي في دمشق أدى إلى مقتل 5 مدنيين';
      const channel = {
        name: 'damascus-channel',
        assigned_regions: ['دمشق', 'ريف دمشق'],
        filtering: {
          min_keyword_matches: 1,
          require_context_keywords: false,
          min_text_length: 30,
          enforce_region_filter: true,
          exclude_patterns: []
        }
      };
      
      const result = scraper.applyEnhancedFiltering(text, channel);
      
      expect(result.shouldImport).toBe(true);
      expect(result.reason).toBe('Passed all filters');
    });

    it('should pass reports when region filtering is disabled', () => {
      const text = 'قصف جوي في حلب أدى إلى مقتل 5 مدنيين';
      const channel = {
        name: 'no-region-channel',
        assigned_regions: ['دمشق', 'ريف دمشق'],
        filtering: {
          min_keyword_matches: 1,
          require_context_keywords: false,
          min_text_length: 30,
          enforce_region_filter: false,
          exclude_patterns: []
        }
      };
      
      const result = scraper.applyEnhancedFiltering(text, channel);
      
      expect(result.shouldImport).toBe(true);
      expect(result.reason).toBe('Passed all filters');
    });

    it('should pass reports when no assigned regions defined', () => {
      const text = 'قصف جوي في حلب أدى إلى مقتل 5 مدنيين';
      const channel = {
        name: 'no-region-channel',
        filtering: {
          min_keyword_matches: 1,
          require_context_keywords: false,
          min_text_length: 30,
          enforce_region_filter: true,
          exclude_patterns: []
        }
      };
      
      const result = scraper.applyEnhancedFiltering(text, channel);
      
      expect(result.shouldImport).toBe(true);
      expect(result.reason).toBe('Passed all filters');
    });
  });

  describe('scrapeChannel with regional filtering', () => {
    const getMockTelegramHTML = (messages) => `
      <!DOCTYPE html>
      <html>
      <body>
        ${messages.map((msg, index) => `
          <div class="tgme_widget_message" data-post="testchannel/${123 + index}">
            <div class="tgme_widget_message_text">${msg.text}</div>
            <div class="tgme_widget_message_date">
              <a href="https://t.me/testchannel/${123 + index}">
                <time datetime="${new Date().toISOString()}">Just now</time>
              </a>
            </div>
            <div class="tgme_widget_message_views">1.2K views</div>
          </div>
        `).join('')}
      </body>
      </html>
    `;

    it('should track regionFiltered count when messages are filtered by region', async () => {
      const messages = [
        { text: 'قصف جوي في دمشق أدى إلى مقتل 5 مدنيين وإصابة 10 آخرين' }, // Should pass
        { text: 'قصف جوي في حلب أدى إلى مقتل 3 مدنيين وإصابة 8 آخرين' }, // Should be filtered
        { text: 'انفجار عبوة ناسفة في العاصمة السورية أدى إلى مقتل مدنيين' }, // Should pass (alias match)
        { text: 'قصف مدفعي في حمص أدى إلى خسائر مادية كبيرة' } // Should be filtered
      ];

      mockHttpClient.get.mockResolvedValue({
        data: getMockTelegramHTML(messages)
      });

      const channel = {
        name: 'damascus-channel',
        url: 'https://t.me/damascus-channel',
        assigned_regions: ['دمشق', 'ريف دمشق'],
        filtering: {
          min_keyword_matches: 1,
          require_context_keywords: false,
          min_text_length: 30,
          enforce_region_filter: true,
          exclude_patterns: []
        }
      };

      const result = await scraper.scrapeChannel(channel);

      expect(result.regionFiltered).toBe(2);
      expect(result.filtered).toBe(2);
      expect(result.newReports).toBe(2);
    });

    it('should not track regionFiltered when region filtering is disabled', async () => {
      const messages = [
        { text: 'قصف جوي في دمشق أدى إلى مقتل 5 مدنيين' },
        { text: 'قصف جوي في حلب أدى إلى مقتل 3 مدنيين' }
      ];

      mockHttpClient.get.mockResolvedValue({
        data: getMockTelegramHTML(messages)
      });

      const channel = {
        name: 'no-region-channel',
        url: 'https://t.me/no-region-channel',
        filtering: {
          min_keyword_matches: 1,
          require_context_keywords: false,
          min_text_length: 30,
          enforce_region_filter: false,
          exclude_patterns: []
        }
      };

      const result = await scraper.scrapeChannel(channel);

      expect(result.regionFiltered).toBe(0);
      expect(result.newReports).toBe(2);
    });

    it('should save reports with error message when region filtered', async () => {
      const messages = [
        { text: 'قصف جوي في حلب أدى إلى مقتل 5 مدنيين' } // Should be filtered
      ];

      mockHttpClient.get.mockResolvedValue({
        data: getMockTelegramHTML(messages)
      });

      const channel = {
        name: 'damascus-channel',
        url: 'https://t.me/damascus-channel',
        assigned_regions: ['دمشق', 'ريف دمشق'],
        filtering: {
          min_keyword_matches: 1,
          require_context_keywords: false,
          min_text_length: 30,
          enforce_region_filter: true,
          exclude_patterns: []
        }
      };

      const result = await scraper.scrapeChannel(channel);

      expect(result.regionFiltered).toBe(1);
      expect(result.newReports).toBe(0);
      
      // Check that no reports were saved since they were filtered
      const reports = await Report.find({});
      expect(reports).toHaveLength(0);
    });

    it('should handle mixed Arabic and English region mentions', async () => {
      const messages = [
        { text: 'Airstrike in damascus killed 5 civilians and wounded 10 others' }, // Should pass
        { text: 'انفجار عبوة ناسفة في العاصمة أدى إلى مقتل مدنيين' }, // Should pass (alias)
        { text: 'Bombing in aleppo today killed civilians' } // Should be filtered
      ];

      mockHttpClient.get.mockResolvedValue({
        data: getMockTelegramHTML(messages)
      });

      const channel = {
        name: 'damascus-channel',
        url: 'https://t.me/damascus-channel',
        assigned_regions: ['دمشق', 'ريف دمشق'],
        filtering: {
          min_keyword_matches: 1,
          require_context_keywords: false,
          min_text_length: 30,
          enforce_region_filter: true,
          exclude_patterns: []
        }
      };

      const result = await scraper.scrapeChannel(channel);

      expect(result.regionFiltered).toBe(1);
      expect(result.newReports).toBe(2);
    });
  });
}); 