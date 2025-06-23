const nock = require('nock');
const TelegramScraper = require('../../services/TelegramScraper');
const Report = require('../../models/Report');
const { connectDB, closeDB } = require('../setup');
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

// Mock HTML response for Telegram channel
const mockTelegramHTML = `
<!DOCTYPE html>
<html>
<body>
<div class="tgme_widget_message" data-post="testchannel/123">
  <div class="tgme_widget_message_text">قصف جوي استهدف مستشفى في حلب أدى إلى مقتل 5 مدنيين وإصابة 15 آخرين</div>
  <div class="tgme_widget_message_date">
    <a href="https://t.me/testchannel/123">
      <time datetime="2024-01-15T10:30:00+00:00">Jan 15, 2024</time>
    </a>
  </div>
  <div class="tgme_widget_message_views">1.2K views</div>
</div>
<div class="tgme_widget_message" data-post="testchannel/124">
  <div class="tgme_widget_message_text">انفجار عبوة ناسفة في دمشق</div>
  <div class="tgme_widget_message_date">
    <a href="https://t.me/testchannel/124">
      <time datetime="2024-01-15T10:25:00+00:00">Jan 15, 2024</time>
    </a>
  </div>
  <div class="tgme_widget_message_views">892 views</div>
</div>
<div class="tgme_widget_message" data-post="testchannel/125">
  <div class="tgme_widget_message_text">Weather update: sunny day</div>
  <div class="tgme_widget_message_date">
    <a href="https://t.me/testchannel/125">
      <time datetime="2024-01-15T10:20:00+00:00">Jan 15, 2024</time>
    </a>
  </div>
</div>
</body>
</html>
`;

describe('TelegramScraper', () => {
  let scraper;

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
          language: 'ar'
        }
      ],
      scraping: {
        interval: 5,
        lookback_window: 5,
        max_messages_per_channel: 50,
        request_timeout: 30,
        max_retries: 3,
        retry_delay: 5000,
        user_agent: 'Mozilla/5.0 Test Agent'
      }
    };

    const keywordsConfig = {
      keywords: {
        AIRSTRIKE: ['قصف جوي', 'غارة جوية'],
        EXPLOSION: ['انفجار', 'عبوة ناسفة'],
        SHELLING: ['قصف']
      },
      context_keywords: ['مدنيين', 'مستشفى'],
      location_keywords: ['حلب', 'دمشق']
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
  });

  afterAll(async () => {
    await closeDB();
    nock.cleanAll();
    jest.restoreAllMocks();
  });

  beforeEach(async () => {
    await Report.deleteMany({});
    nock.cleanAll();
  });

  describe('Configuration Loading', () => {
    it('should load channels and keywords configuration', () => {
      expect(scraper.activeChannels).toHaveLength(1);
      expect(scraper.activeChannels[0].name).toBe('testchannel');
      expect(scraper.allKeywords.length).toBeGreaterThan(0);
      expect(scraper.allKeywords).toContain('قصف جوي');
      expect(scraper.allKeywords).toContain('مدنيين');
    });
  });

  describe('Keyword Matching', () => {
    it('should find matching keywords in Arabic text', () => {
      const text = 'قصف جوي استهدف مستشفى في حلب';
      const matches = scraper.findMatchingKeywords(text);
      
      expect(matches).toContain('قصف جوي');
      expect(matches).toContain('مستشفى');
      expect(matches).toContain('حلب');
    });

    it('should not match keywords in irrelevant text', () => {
      const text = 'Weather is sunny today';
      const matches = scraper.findMatchingKeywords(text);
      
      expect(matches).toHaveLength(0);
    });
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

  describe('Channel Scraping', () => {
    it('should successfully scrape a channel and save reports', async () => {
      // Mock HTTP request
      nock('https://t.me')
        .get('/s/testchannel')
        .reply(200, mockTelegramHTML);

      const channel = scraper.activeChannels[0];
      const result = await scraper.scrapeChannel(channel);

      expect(result.newReports).toBe(2); // Two messages with keywords
      expect(result.duplicates).toBe(0);
      expect(result.processed).toBeGreaterThan(0);

      // Check if reports were saved to database
      const savedReports = await Report.find({});
      expect(savedReports).toHaveLength(2);
      
      const report1 = savedReports.find(r => r.metadata.messageId === '123');
      expect(report1).toBeDefined();
      expect(report1.text).toContain('قصف جوي');
      expect(report1.metadata.matchedKeywords).toContain('قصف جوي');
      expect(report1.metadata.language).toBe('ar');
    });

    it('should handle duplicate messages correctly', async () => {
      // First scrape
      nock('https://t.me')
        .get('/s/testchannel')
        .reply(200, mockTelegramHTML);

      const channel = scraper.activeChannels[0];
      await scraper.scrapeChannel(channel);

      // Second scrape with same content
      nock('https://t.me')
        .get('/s/testchannel')
        .reply(200, mockTelegramHTML);

      const result = await scraper.scrapeChannel(channel);

      expect(result.newReports).toBe(0);
      expect(result.duplicates).toBe(2);

      // Should still have only 2 reports in database
      const savedReports = await Report.find({});
      expect(savedReports).toHaveLength(2);
    });

    it('should handle HTTP errors gracefully', async () => {
      nock('https://t.me')
        .get('/s/testchannel')
        .reply(500, 'Internal Server Error');

      const channel = scraper.activeChannels[0];
      
      await expect(scraper.scrapeChannel(channel)).rejects.toThrow();
    });

    it('should skip messages without keywords', async () => {
      const htmlWithoutKeywords = `
        <div class="tgme_widget_message">
          <div class="tgme_widget_message_text">Just a regular message about weather</div>
          <div class="tgme_widget_message_date">
            <a href="https://t.me/testchannel/126">
              <time datetime="2024-01-15T10:30:00+00:00">Jan 15, 2024</time>
            </a>
          </div>
        </div>
      `;

      nock('https://t.me')
        .get('/s/testchannel')
        .reply(200, htmlWithoutKeywords);

      const channel = scraper.activeChannels[0];
      const result = await scraper.scrapeChannel(channel);

      expect(result.newReports).toBe(0);
      expect(result.processed).toBe(1);
    });
  });

  describe('Statistics', () => {
    beforeEach(async () => {
      // Create test reports
      const reports = [
        {
          source_url: 'https://t.me/testchannel/1',
          text: 'Report 1',
          date: new Date(),
          metadata: { channel: 'testchannel', messageId: '1', scrapedAt: new Date() }
        },
        {
          source_url: 'https://t.me/testchannel/2',
          text: 'Report 2',
          date: new Date(),
          parsedByLLM: true,
          metadata: { channel: 'testchannel', messageId: '2', scrapedAt: new Date() }
        }
      ];

      await Report.insertMany(reports);
    });

    it('should return correct statistics', async () => {
      const stats = await scraper.getStats();

      expect(stats.totalReports).toBe(2);
      expect(stats.unparsedReports).toBe(1);
      expect(stats.activeChannels).toBe(1);
      expect(stats.channelStats).toHaveLength(1);
      expect(stats.channelStats[0].channel).toBe('testchannel');
      expect(stats.channelStats[0].reports).toBe(2);
    });
  });

  describe('Channel Testing', () => {
    it('should test channel connectivity successfully', async () => {
      nock('https://t.me')
        .get('/s/testchannel')
        .reply(200, 'OK');

      const result = await scraper.testChannel('testchannel');

      expect(result.channel).toBe('testchannel');
      expect(result.accessible).toBe(true);
      expect(result.status).toBe(200);
    });

    it('should handle channel connectivity failure', async () => {
      nock('https://t.me')
        .get('/s/testchannel')
        .reply(404, 'Not Found');

      const result = await scraper.testChannel('testchannel');

      expect(result.channel).toBe('testchannel');
      expect(result.accessible).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should throw error for non-existent channel', async () => {
      await expect(scraper.testChannel('nonexistent')).rejects.toThrow('Channel nonexistent not found');
    });
  });
});