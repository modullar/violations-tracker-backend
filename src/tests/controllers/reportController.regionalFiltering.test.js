const request = require('supertest');
const express = require('express');
const mongoose = require('mongoose');
const Report = require('../../models/Report');
const { getRegionalFilteringStats } = require('../../controllers/reportController');
const { connectDB, closeDB } = require('../setup');

// Mock the auth middleware
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

// Mock logger
jest.mock('../../config/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn()
}));

// Create a test Express app
const createTestApp = () => {
  const app = express();
  app.use(express.json());
  
  // Mock auth middleware
  app.use((req, res, next) => {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      if (token === 'admin-token') {
        req.user = { id: 'admin-id', role: 'admin' };
      } else if (token === 'editor-token') {
        req.user = { id: 'editor-id', role: 'editor' };
      } else if (token === 'user-token') {
        req.user = { id: 'user-id', role: 'user' };
      }
    }
    next();
  });
  
  // Add the regional filtering stats route
  app.get('/api/reports/regional-stats', 
    require('../../middleware/auth').protect, 
    require('../../middleware/auth').authorize('admin'),
    getRegionalFilteringStats
  );
  
  return app;
};

describe('ReportController - Regional Filtering Statistics', () => {
  let app;
  let adminToken;
  let editorToken;
  let userToken;

  beforeAll(async () => {
    await connectDB();
    app = createTestApp();
    
    // Set up test tokens
    adminToken = 'admin-token';
    editorToken = 'editor-token';
    userToken = 'user-token';
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

  describe('GET /api/reports/regional-stats', () => {
    it('should return 401 if not authenticated', async () => {
      const response = await request(app)
        .get('/api/reports/regional-stats')
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Not authorized');
    });

    it('should return 403 if user is not admin', async () => {
      const response = await request(app)
        .get('/api/reports/regional-stats')
        .set('Authorization', `Bearer ${editorToken}`)
        .expect(403);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Forbidden');
    });

    it('should return 403 if user is regular user', async () => {
      const response = await request(app)
        .get('/api/reports/regional-stats')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(403);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Forbidden');
    });

    it('should return empty stats when no reports exist', async () => {
      const response = await request(app)
        .get('/api/reports/regional-stats')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('summary');
      expect(response.body.data).toHaveProperty('channelBreakdown');
      expect(response.body.data.summary.totalReports).toBe(0);
      expect(response.body.data.summary.regionFiltered).toBe(0);
      expect(response.body.data.summary.costSavingsPercent).toBe(0);
      expect(response.body.data.channelBreakdown).toEqual([]);
    });

    it('should return regional filtering statistics for default 24-hour period', async () => {
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
          status: 'failed',
          error: 'Claude API error',
          metadata: {
            channel: 'aleppo-channel',
            messageId: '125',
            scrapedAt: twoHoursAgo
          }
        }
      ]);

      const response = await request(app)
        .get('/api/reports/regional-stats')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.summary.totalReports).toBe(3);
      expect(response.body.data.summary.regionFiltered).toBe(1);
      expect(response.body.data.summary.processed).toBe(1);
      expect(response.body.data.summary.sentToClaudeAPI).toBe(2); // processed + failed
      expect(response.body.data.summary.costSavingsPercent).toBe('33.33'); // 1/3 * 100
      expect(response.body.data.summary.timeRange).toBe('24 hours');
      expect(response.body.data.channelBreakdown).toHaveLength(2);
    });

    it('should respect custom hours parameter', async () => {
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

      // Test with 2-hour window
      const response = await request(app)
        .get('/api/reports/regional-stats?hours=2')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.summary.totalReports).toBe(1);
      expect(response.body.data.summary.regionFiltered).toBe(1);
      expect(response.body.data.summary.timeRange).toBe('2 hours');
    });

    it('should calculate channel breakdown correctly', async () => {
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 1 * 60 * 60 * 1000);

      // Create reports for multiple channels with different stats
      await Report.create([
        // Damascus channel: 3 total, 2 region filtered, 1 processed
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
          text: 'قصف جوي في حمص',
          date: oneHourAgo,
          status: 'unprocessed',
          error: 'No assigned region found. Channel covers: دمشق, ريف دمشق',
          metadata: {
            channel: 'damascus-channel',
            messageId: '124',
            scrapedAt: oneHourAgo
          }
        },
        {
          source_url: 'https://t.me/damascus-channel/125',
          text: 'انفجار في دمشق',
          date: oneHourAgo,
          status: 'processed',
          metadata: {
            channel: 'damascus-channel',
            messageId: '125',
            scrapedAt: oneHourAgo
          }
        },
        // Aleppo channel: 2 total, 0 region filtered, 1 processed, 1 failed
        {
          source_url: 'https://t.me/aleppo-channel/126',
          text: 'انفجار في حلب',
          date: oneHourAgo,
          status: 'processed',
          metadata: {
            channel: 'aleppo-channel',
            messageId: '126',
            scrapedAt: oneHourAgo
          }
        },
        {
          source_url: 'https://t.me/aleppo-channel/127',
          text: 'قصف في حلب',
          date: oneHourAgo,
          status: 'failed',
          error: 'Claude API error',
          metadata: {
            channel: 'aleppo-channel',
            messageId: '127',
            scrapedAt: oneHourAgo
          }
        }
      ]);

      const response = await request(app)
        .get('/api/reports/regional-stats')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.channelBreakdown).toHaveLength(2);

      // Find stats for each channel
      const damascusStats = response.body.data.channelBreakdown.find(
        stat => stat._id === 'damascus-channel'
      );
      const aleppoStats = response.body.data.channelBreakdown.find(
        stat => stat._id === 'aleppo-channel'
      );

      expect(damascusStats).toBeDefined();
      expect(damascusStats.totalReports).toBe(3);
      expect(damascusStats.regionFiltered).toBe(2);
      expect(damascusStats.processed).toBe(1);
      expect(damascusStats.failed).toBe(0);
      expect(damascusStats.regionFilterRate).toBeCloseTo(66.67, 2); // 2/3 * 100

      expect(aleppoStats).toBeDefined();
      expect(aleppoStats.totalReports).toBe(2);
      expect(aleppoStats.regionFiltered).toBe(0);
      expect(aleppoStats.processed).toBe(1);
      expect(aleppoStats.failed).toBe(1);
      expect(aleppoStats.regionFilterRate).toBe(0); // 0/2 * 100
    });

    it('should handle invalid hours parameter gracefully', async () => {
      const response = await request(app)
        .get('/api/reports/regional-stats?hours=invalid')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.summary.timeRange).toBe('24 hours'); // Default fallback
    });

    it('should handle negative hours parameter gracefully', async () => {
      const response = await request(app)
        .get('/api/reports/regional-stats?hours=-5')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.summary.timeRange).toBe('1 hours'); // Minimum fallback
    });

    it('should calculate cost savings percentage correctly', async () => {
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 1 * 60 * 60 * 1000);

      // Create 10 reports, 3 region filtered
      const reports = [];
      for (let i = 0; i < 10; i++) {
        reports.push({
          source_url: `https://t.me/test-channel/${i}`,
          text: `Test report ${i}`,
          date: oneHourAgo,
          status: i < 3 ? 'unprocessed' : 'processed',
          error: i < 3 ? 'No assigned region found. Channel covers: دمشق' : null,
          metadata: {
            channel: 'test-channel',
            messageId: `${i}`,
            scrapedAt: oneHourAgo
          }
        });
      }

      await Report.create(reports);

      const response = await request(app)
        .get('/api/reports/regional-stats')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.summary.totalReports).toBe(10);
      expect(response.body.data.summary.regionFiltered).toBe(3);
      expect(response.body.data.summary.costSavingsPercent).toBe('30.00'); // 3/10 * 100
    });

    it('should sort channels by total reports in descending order', async () => {
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 1 * 60 * 60 * 1000);

      // Create different numbers of reports for different channels
      await Report.create([
                          // Channel A: 1 report
         {
           source_url: 'https://t.me/channel-a/1',
           text: 'Test report A with sufficient text length',
           date: oneHourAgo,
           status: 'processed',
           metadata: {
             channel: 'channel-a',
             messageId: '1',
             scrapedAt: oneHourAgo
           }
         },
         // Channel B: 3 reports  
         {
           source_url: 'https://t.me/channel-b/1',
           text: 'Test report B1 with sufficient text length',
           date: oneHourAgo,
           status: 'processed',
           metadata: {
             channel: 'channel-b',
             messageId: '1',
             scrapedAt: oneHourAgo
           }
         },
         {
           source_url: 'https://t.me/channel-b/2',
           text: 'Test report B2 with sufficient text length',
           date: oneHourAgo,
           status: 'processed',
           metadata: {
             channel: 'channel-b',
             messageId: '2',
             scrapedAt: oneHourAgo
           }
         },
         {
           source_url: 'https://t.me/channel-b/3',
           text: 'Test report B3 with sufficient text length',
           date: oneHourAgo,
           status: 'processed',
           metadata: {
             channel: 'channel-b',
             messageId: '3',
             scrapedAt: oneHourAgo
           }
         },
         // Channel C: 2 reports
         {
           source_url: 'https://t.me/channel-c/1',
           text: 'Test report C1 with sufficient text length',
           date: oneHourAgo,
           status: 'processed',
           metadata: {
             channel: 'channel-c',
             messageId: '1',
             scrapedAt: oneHourAgo
           }
         },
         {
           source_url: 'https://t.me/channel-c/2',
           text: 'Test report C2 with sufficient text length',
           date: oneHourAgo,
           status: 'processed',
           metadata: {
             channel: 'channel-c',
             messageId: '2',
             scrapedAt: oneHourAgo
           }
         }
      ]);

      const response = await request(app)
        .get('/api/reports/regional-stats')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.channelBreakdown).toHaveLength(3);

      // Should be sorted by totalReports descending: B (3), C (2), A (1)
      expect(response.body.data.channelBreakdown[0]._id).toBe('channel-b');
      expect(response.body.data.channelBreakdown[0].totalReports).toBe(3);
      expect(response.body.data.channelBreakdown[1]._id).toBe('channel-c');
      expect(response.body.data.channelBreakdown[1].totalReports).toBe(2);
      expect(response.body.data.channelBreakdown[2]._id).toBe('channel-a');
      expect(response.body.data.channelBreakdown[2].totalReports).toBe(1);
    });
  });
}); 