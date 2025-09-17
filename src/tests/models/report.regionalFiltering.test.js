const mongoose = require('mongoose');
const Report = require('../../models/Report');
const { connectDB, closeDB } = require('../setup');

describe('Report Model - Regional Filtering Statistics', () => {
  beforeAll(async () => {
    await connectDB();
  });

  beforeEach(async () => {
    // Clear all test data between tests
    if (mongoose.connection.readyState !== 0) {
      const collections = mongoose.connection.collections;
      for (const key in collections) {
        const collection = collections[key];
        await collection.deleteMany();
      }
    }
  });

  afterAll(async () => {
    await closeDB();
  });

  describe('getRegionalFilteringStats', () => {
    it('should return empty array when no reports exist', async () => {
      const stats = await Report.getRegionalFilteringStats(24);
      expect(stats).toEqual([]);
    });

    it('should return statistics for region-filtered reports', async () => {
      const now = new Date();
      const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);

      // Create test reports
      await Report.create([
        {
          source_url: 'https://t.me/damascus-channel/123',
          text: 'قصف جوي في حلب أدى إلى مقتل 5 مدنيين',
          date: twoHoursAgo,
          status: 'unprocessed',
          error: 'No assigned region found. Channel covers: دمشق, ريف دمشق',
          metadata: {
            channel: 'damascus-channel',
            messageId: '123',
            scrapedAt: twoHoursAgo
          }
        },
        {
          source_url: 'https://t.me/damascus-channel/124',
          text: 'انفجار في دمشق',
          date: twoHoursAgo,
          status: 'processed',
          metadata: {
            channel: 'damascus-channel',
            messageId: '124',
            scrapedAt: twoHoursAgo
          }
        },
        {
          source_url: 'https://t.me/aleppo-channel/125',
          text: 'قصف في دمشق',
          date: twoHoursAgo,
          status: 'unprocessed',
          error: 'No assigned region found. Channel covers: حلب, ريف حلب',
          metadata: {
            channel: 'aleppo-channel',
            messageId: '125',
            scrapedAt: twoHoursAgo
          }
        },
        {
          source_url: 'https://t.me/aleppo-channel/126',
          text: 'انفجار في حلب',
          date: twoHoursAgo,
          status: 'processed',
          metadata: {
            channel: 'aleppo-channel',
            messageId: '126',
            scrapedAt: twoHoursAgo
          }
        }
      ]);

      const stats = await Report.getRegionalFilteringStats(24);

      expect(stats).toHaveLength(2);
      
      // Find stats for each channel
      const damascusStats = stats.find(stat => stat._id === 'damascus-channel');
      const aleppoStats = stats.find(stat => stat._id === 'aleppo-channel');

      expect(damascusStats).toBeDefined();
      expect(damascusStats.totalReports).toBe(2);
      expect(damascusStats.regionFiltered).toBe(1);

      expect(aleppoStats).toBeDefined();
      expect(aleppoStats.totalReports).toBe(2);
      expect(aleppoStats.regionFiltered).toBe(1);
    });

    it('should only include reports within specified time range', async () => {
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 1 * 60 * 60 * 1000);
      const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);

      // Create reports - one recent, one old
      await Report.create([
        {
          source_url: 'https://t.me/damascus-channel/123',
          text: 'قصف جوي في حلب',
          date: oneHourAgo,
          status: 'unprocessed',
          error: 'No assigned region found. Channel covers: دمشق, ريف دمشق',
          metadata: {
            channel: 'damascus-channel',
            messageId: '123',
            scrapedAt: oneHourAgo
          }
        },
        {
          source_url: 'https://t.me/damascus-channel/124',
          text: 'قصف جوي في حلب',
          date: threeDaysAgo,
          status: 'unprocessed',
          error: 'No assigned region found. Channel covers: دمشق, ريف دمشق',
          metadata: {
            channel: 'damascus-channel',
            messageId: '124',
            scrapedAt: threeDaysAgo
          }
        }
      ]);

      const stats = await Report.getRegionalFilteringStats(24);

      expect(stats).toHaveLength(1);
      expect(stats[0]._id).toBe('damascus-channel');
      expect(stats[0].totalReports).toBe(1);
      expect(stats[0].regionFiltered).toBe(1);
    });

    it('should correctly identify region-filtered reports by error message', async () => {
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 1 * 60 * 60 * 1000);

      // Create reports with different error messages
      await Report.create([
        {
          source_url: 'https://t.me/damascus-channel/123',
          text: 'قصف جوي في حلب',
          date: oneHourAgo,
          status: 'unprocessed',
          error: 'No assigned region found. Channel covers: دمشق, ريف دمشق',
          metadata: {
            channel: 'damascus-channel',
            messageId: '123',
            scrapedAt: oneHourAgo
          }
        },
        {
          source_url: 'https://t.me/damascus-channel/124',
          text: 'Short text',
          date: oneHourAgo,
          status: 'unprocessed',
          error: 'Text too short (12 < 30)',
          metadata: {
            channel: 'damascus-channel',
            messageId: '124',
            scrapedAt: oneHourAgo
          }
        },
        {
          source_url: 'https://t.me/damascus-channel/125',
          text: 'Some other error',
          date: oneHourAgo,
          status: 'failed',
          error: 'Claude API error',
          metadata: {
            channel: 'damascus-channel',
            messageId: '125',
            scrapedAt: oneHourAgo
          }
        }
      ]);

      const stats = await Report.getRegionalFilteringStats(24);

      expect(stats).toHaveLength(1);
      expect(stats[0]._id).toBe('damascus-channel');
      expect(stats[0].totalReports).toBe(3);
      expect(stats[0].regionFiltered).toBe(1); // Only the one with region error
    });

    it('should handle case insensitive regex matching', async () => {
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 1 * 60 * 60 * 1000);

      // Create reports with different case variations
      await Report.create([
        {
          source_url: 'https://t.me/damascus-channel/123',
          text: 'قصف جوي في حلب',
          date: oneHourAgo,
          status: 'unprocessed',
          error: 'no assigned region found. channel covers: دمشق, ريف دمشق',
          metadata: {
            channel: 'damascus-channel',
            messageId: '123',
            scrapedAt: oneHourAgo
          }
        },
        {
          source_url: 'https://t.me/damascus-channel/124',
          text: 'قصف جوي في حلب',
          date: oneHourAgo,
          status: 'unprocessed',
          error: 'NO ASSIGNED REGION FOUND. CHANNEL COVERS: دمشق, ريف دمشق',
          metadata: {
            channel: 'damascus-channel',
            messageId: '124',
            scrapedAt: oneHourAgo
          }
        }
      ]);

      const stats = await Report.getRegionalFilteringStats(24);

      expect(stats).toHaveLength(1);
      expect(stats[0]._id).toBe('damascus-channel');
      expect(stats[0].totalReports).toBe(2);
      expect(stats[0].regionFiltered).toBe(2); // Both should match
    });

    it('should handle reports with null or undefined error messages', async () => {
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 1 * 60 * 60 * 1000);

      // Create reports with null/undefined error messages
      await Report.create([
        {
          source_url: 'https://t.me/damascus-channel/123',
          text: 'قصف جوي في دمشق',
          date: oneHourAgo,
          status: 'processed',
          error: null,
          metadata: {
            channel: 'damascus-channel',
            messageId: '123',
            scrapedAt: oneHourAgo
          }
        },
        {
          source_url: 'https://t.me/damascus-channel/124',
          text: 'انفجار في دمشق',
          date: oneHourAgo,
          status: 'processed',
          metadata: {
            channel: 'damascus-channel',
            messageId: '124',
            scrapedAt: oneHourAgo
          }
        }
      ]);

      const stats = await Report.getRegionalFilteringStats(24);

      expect(stats).toHaveLength(1);
      expect(stats[0]._id).toBe('damascus-channel');
      expect(stats[0].totalReports).toBe(2);
      expect(stats[0].regionFiltered).toBe(0); // No region filtering errors
    });

    it('should respect custom time range parameter', async () => {
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 1 * 60 * 60 * 1000);
      const threeHoursAgo = new Date(now.getTime() - 3 * 60 * 60 * 1000);

      // Create reports at different times
      await Report.create([
        {
          source_url: 'https://t.me/damascus-channel/123',
          text: 'قصف جوي في حلب',
          date: oneHourAgo,
          status: 'unprocessed',
          error: 'No assigned region found. Channel covers: دمشق, ريف دمشق',
          metadata: {
            channel: 'damascus-channel',
            messageId: '123',
            scrapedAt: oneHourAgo
          }
        },
        {
          source_url: 'https://t.me/damascus-channel/124',
          text: 'قصف جوي في حلب',
          date: threeHoursAgo,
          status: 'unprocessed',
          error: 'No assigned region found. Channel covers: دمشق, ريف دمشق',
          metadata: {
            channel: 'damascus-channel',
            messageId: '124',
            scrapedAt: threeHoursAgo
          }
        }
      ]);

      // Test with 2-hour window (should include only first report)
      const stats2Hours = await Report.getRegionalFilteringStats(2);
      expect(stats2Hours).toHaveLength(1);
      expect(stats2Hours[0].totalReports).toBe(1);
      expect(stats2Hours[0].regionFiltered).toBe(1);

      // Test with 4-hour window (should include both reports)
      const stats4Hours = await Report.getRegionalFilteringStats(4);
      expect(stats4Hours).toHaveLength(1);
      expect(stats4Hours[0].totalReports).toBe(2);
      expect(stats4Hours[0].regionFiltered).toBe(2);
    });

    it('should group reports by channel correctly', async () => {
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 1 * 60 * 60 * 1000);

      // Create reports for multiple channels
      await Report.create([
        {
          source_url: 'https://t.me/damascus-channel/123',
          text: 'قصف جوي في حلب',
          date: oneHourAgo,
          status: 'unprocessed',
          error: 'No assigned region found. Channel covers: دمشق, ريف دمشق',
          metadata: {
            channel: 'damascus-channel',
            messageId: '123',
            scrapedAt: oneHourAgo
          }
        },
        {
          source_url: 'https://t.me/damascus-channel/124',
          text: 'انفجار في دمشق',
          date: oneHourAgo,
          status: 'processed',
          metadata: {
            channel: 'damascus-channel',
            messageId: '124',
            scrapedAt: oneHourAgo
          }
        },
        {
          source_url: 'https://t.me/aleppo-channel/125',
          text: 'قصف في دمشق',
          date: oneHourAgo,
          status: 'unprocessed',
          error: 'No assigned region found. Channel covers: حلب, ريف حلب',
          metadata: {
            channel: 'aleppo-channel',
            messageId: '125',
            scrapedAt: oneHourAgo
          }
        },
        {
          source_url: 'https://t.me/idlib-channel/126',
          text: 'انفجار في إدلب',
          date: oneHourAgo,
          status: 'processed',
          metadata: {
            channel: 'idlib-channel',
            messageId: '126',
            scrapedAt: oneHourAgo
          }
        }
      ]);

      const stats = await Report.getRegionalFilteringStats(24);

      expect(stats).toHaveLength(3);
      
      const channelNames = stats.map(stat => stat._id).sort();
      expect(channelNames).toEqual(['aleppo-channel', 'damascus-channel', 'idlib-channel']);
      
      // Check specific channel stats
      const damascusStats = stats.find(stat => stat._id === 'damascus-channel');
      expect(damascusStats.totalReports).toBe(2);
      expect(damascusStats.regionFiltered).toBe(1);
      
      const aleppoStats = stats.find(stat => stat._id === 'aleppo-channel');
      expect(aleppoStats.totalReports).toBe(1);
      expect(aleppoStats.regionFiltered).toBe(1);
      
      const idlibStats = stats.find(stat => stat._id === 'idlib-channel');
      expect(idlibStats.totalReports).toBe(1);
      expect(idlibStats.regionFiltered).toBe(0);
    });
  });
}); 