const mongoose = require('mongoose');
const Report = require('../../models/Report');
const { connectDB, closeDB } = require('../setup');

describe('Report Model', () => {
  beforeAll(async () => {
    await connectDB();
  });

  afterAll(async () => {
    await closeDB();
  });

  beforeEach(async () => {
    await Report.deleteMany({});
  });

  describe('Report Creation', () => {
    it('should create a valid report with all required fields', async () => {
      const reportData = {
        source_url: 'https://t.me/testchannel/123',
        text: 'This is a test report with enough text to meet the minimum requirement',
        date: new Date('2024-01-15T10:00:00Z'),
        parsedByLLM: false,
        metadata: {
          channel: 'testchannel',
          messageId: '123',
          scrapedAt: new Date(),
          matchedKeywords: ['قصف', 'مدنيين'],
          language: 'ar',
          mediaCount: 2,
          forwardedFrom: null,
          viewCount: 150
        }
      };

      const report = new Report(reportData);
      const savedReport = await report.save();

      expect(savedReport._id).toBeDefined();
      expect(savedReport.source_url).toBe(reportData.source_url);
      expect(savedReport.text).toBe(reportData.text);
      expect(savedReport.parsedByLLM).toBe(false);
      expect(savedReport.status).toBe('new');
      expect(savedReport.metadata.channel).toBe('testchannel');
      expect(savedReport.metadata.matchedKeywords).toEqual(['قصف', 'مدنيين']);
    });

    it('should fail validation with invalid Telegram URL', async () => {
      const reportData = {
        source_url: 'https://invalid-url.com',
        text: 'This is a test report with enough text',
        date: new Date(),
        metadata: {
          channel: 'testchannel',
          messageId: '123'
        }
      };

      const report = new Report(reportData);
      
      await expect(report.save()).rejects.toThrow();
    });

    it('should fail validation with short text', async () => {
      const reportData = {
        source_url: 'https://t.me/testchannel/123',
        text: 'Short',
        date: new Date(),
        metadata: {
          channel: 'testchannel',
          messageId: '123'
        }
      };

      const report = new Report(reportData);
      
      await expect(report.save()).rejects.toThrow();
    });

    it('should fail validation with future date', async () => {
      const futureDate = new Date();
      futureDate.setHours(futureDate.getHours() + 2);

      const reportData = {
        source_url: 'https://t.me/testchannel/123',
        text: 'This is a test report with enough text',
        date: futureDate,
        metadata: {
          channel: 'testchannel',
          messageId: '123'
        }
      };

      const report = new Report(reportData);
      
      await expect(report.save()).rejects.toThrow();
    });
  });

  describe('Static Methods', () => {
    beforeEach(async () => {
      // Create test reports
      const reports = [
        {
          source_url: 'https://t.me/channel1/1',
          text: 'Processed report text with enough characters',
          date: new Date(),
          parsedByLLM: true,
          status: 'parsed',
          metadata: { channel: 'channel1', messageId: '1', scrapedAt: new Date() }
        },
        {
          source_url: 'https://t.me/channel1/2',
          text: 'Unprocessed report text with enough characters',
          date: new Date(),
          parsedByLLM: false,
          status: 'new',
          metadata: { channel: 'channel1', messageId: '2', scrapedAt: new Date() }
        },
        {
          source_url: 'https://t.me/channel2/1',
          text: 'Another unprocessed report text with enough characters',
          date: new Date(),
          parsedByLLM: false,
          status: 'new',
          metadata: { channel: 'channel2', messageId: '1', scrapedAt: new Date() }
        }
      ];

      await Report.insertMany(reports);
    });

    it('should find reports ready for processing', async () => {
      const reports = await Report.findReadyForProcessing(10);
      
      expect(reports).toHaveLength(2);
      expect(reports.every(report => !report.parsedByLLM && report.status === 'new')).toBe(true);
    });

    it('should find recent reports by channel', async () => {
      const reports = await Report.findRecentByChannel('channel1', 24);
      
      expect(reports).toHaveLength(2);
      expect(reports.every(report => report.metadata.channel === 'channel1')).toBe(true);
    });

    it('should check if report exists', async () => {
      const exists = await Report.exists('channel1', '1');
      const notExists = await Report.exists('channel1', '999');
      
      expect(exists).toBeTruthy();
      expect(notExists).toBeFalsy();
    });

    it('should sanitize data correctly', async () => {
      const inputData = {
        source_url: 'https://t.me/test/123',
        text: 'Test text',
        date: '2024-01-15',
        metadata: {
          channel: 'test',
          messageId: '123'
        }
      };

      const sanitized = Report.sanitizeData(inputData);
      
      expect(sanitized.date instanceof Date).toBe(true);
      expect(sanitized.parsedByLLM).toBe(false);
      expect(sanitized.status).toBe('new');
      expect(sanitized.metadata.matchedKeywords).toEqual([]);
    });
  });

  describe('Instance Methods', () => {
    let report;

    beforeEach(async () => {
      report = new Report({
        source_url: 'https://t.me/testchannel/123',
        text: 'Test report with keywords: قصف and مدنيين in Arabic',
        date: new Date(),
        metadata: {
          channel: 'testchannel',
          messageId: '123',
          scrapedAt: new Date()
        }
      });
      
      await report.save();
    });

    it('should mark report as processed', async () => {
      const jobId = new mongoose.Types.ObjectId();
      
      await report.markAsProcessed(jobId);
      
      expect(report.parsedByLLM).toBe(true);
      expect(report.status).toBe('parsed');
      expect(report.parsingJobId).toEqual(jobId);
    });

    it('should mark report as failed', async () => {
      const errorMessage = 'Processing failed due to timeout';
      
      await report.markAsFailed(errorMessage);
      
      expect(report.status).toBe('failed');
      expect(report.error).toBe(errorMessage);
    });

    it('should extract keywords from text', () => {
      const keywords = ['قصف', 'مدنيين', 'غارة', 'hospital'];
      
      const matched = report.extractKeywords(keywords);
      
      expect(matched).toContain('قصف');
      expect(matched).toContain('مدنيين');
      expect(matched).not.toContain('غارة');
      expect(report.metadata.matchedKeywords).toEqual(matched);
    });
  });

  describe('Indexes and Uniqueness', () => {
    it('should enforce unique constraint on source_url', async () => {
      const reportData = {
        source_url: 'https://t.me/testchannel/123',
        text: 'First report with this URL',
        date: new Date(),
        metadata: {
          channel: 'testchannel',
          messageId: '123'
        }
      };

      const report1 = new Report(reportData);
      await report1.save();

      const report2 = new Report({
        ...reportData,
        text: 'Second report with same URL'
      });

      await expect(report2.save()).rejects.toThrow();
    });

    it('should enforce unique constraint on channel + messageId combination', async () => {
      const report1 = new Report({
        source_url: 'https://t.me/testchannel/123',
        text: 'First report',
        date: new Date(),
        metadata: {
          channel: 'testchannel',
          messageId: '123'
        }
      });
      await report1.save();

      const report2 = new Report({
        source_url: 'https://t.me/testchannel/124',
        text: 'Second report with same channel and messageId',
        date: new Date(),
        metadata: {
          channel: 'testchannel',
          messageId: '123'
        }
      });

      await expect(report2.save()).rejects.toThrow();
    });
  });

  describe('JSON Serialization', () => {
    it('should format dates correctly in JSON output', async () => {
      const testDate = new Date('2024-01-15T10:30:00Z');
      const scrapedDate = new Date('2024-01-15T10:35:00Z');

      const report = new Report({
        source_url: 'https://t.me/testchannel/123',
        text: 'Test report for JSON serialization',
        date: testDate,
        metadata: {
          channel: 'testchannel',
          messageId: '123',
          scrapedAt: scrapedDate
        }
      });

      await report.save();

      const json = report.toJSON();
      
      expect(json.date).toBe(testDate.toISOString());
      expect(json.metadata.scrapedAt).toBe(scrapedDate.toISOString());
    });
  });
});