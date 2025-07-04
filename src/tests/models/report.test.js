const mongoose = require('mongoose');
const Report = require('../../models/Report');
const { connectTestDatabase, clearTestDatabase, closeTestDatabase } = require('../setup');

describe('Report Model', () => {
  beforeAll(async () => {
    await connectTestDatabase();
  });

  beforeEach(async () => {
    await clearTestDatabase();
  });

  afterAll(async () => {
    await closeTestDatabase();
  });

  describe('Schema and Validation', () => {
    it('should create a report with new fields', async () => {
      const reportData = {
        source_url: 'https://t.me/testchannel/123',
        text: 'Test report text with enough characters to pass validation',
        date: new Date(),
        metadata: {
          channel: 'testchannel',
          messageId: '123',
          scrapedAt: new Date()
        }
      };

      const report = new Report(reportData);
      const savedReport = await report.save();

      expect(savedReport.status).toBe('unprocessed');
      expect(savedReport.violation_ids).toEqual([]);
      expect(savedReport.processing_metadata.attempts).toBe(0);
      expect(savedReport.processing_metadata.violations_created).toBe(0);
    });

    it('should validate status enum values', async () => {
      const reportData = {
        source_url: 'https://t.me/testchannel/123',
        text: 'Test report text with enough characters to pass validation',
        date: new Date(),
        status: 'invalid_status',
        metadata: {
          channel: 'testchannel',
          messageId: '123'
        }
      };

      const report = new Report(reportData);
      
      await expect(report.save()).rejects.toThrow();
    });

    it('should accept valid status values', async () => {
      const validStatuses = ['unprocessed', 'processing', 'processed', 'failed', 'ignored', 'retry_pending'];
      
      for (const status of validStatuses) {
        const reportData = {
          source_url: `https://t.me/testchannel/${status}`,
          text: 'Test report text with enough characters to pass validation',
          date: new Date(),
          status: status,
          metadata: {
            channel: 'testchannel',
            messageId: status
          }
        };

        const report = new Report(reportData);
        const savedReport = await report.save();
        expect(savedReport.status).toBe(status);
      }
    });
  });

  describe('Processing Methods', () => {
    let report;

    beforeEach(async () => {
      const reportData = {
        source_url: 'https://t.me/testchannel/123',
        text: 'Test report text with enough characters to pass validation',
        date: new Date(),
        metadata: {
          channel: 'testchannel',
          messageId: '123',
          scrapedAt: new Date()
        }
      };

      report = new Report(reportData);
      await report.save();
    });

    describe('markAsProcessing', () => {
      it('should update status and increment attempts', async () => {
        expect(report.processing_metadata.attempts).toBe(0);
        expect(report.status).toBe('unprocessed');

        await report.markAsProcessing();

        expect(report.status).toBe('processing');
        expect(report.processing_metadata.attempts).toBe(1);
        expect(report.processing_metadata.started_at).toBeInstanceOf(Date);
        expect(report.processing_metadata.last_attempt).toBeInstanceOf(Date);
      });

      it('should increment attempts on subsequent calls', async () => {
        await report.markAsProcessing();
        expect(report.processing_metadata.attempts).toBe(1);

        await report.markAsProcessing();
        expect(report.processing_metadata.attempts).toBe(2);
      });
    });

    describe('markAsProcessed', () => {
      it('should mark report as processed with violation IDs', async () => {
        const violationIds = [
          new mongoose.Types.ObjectId(),
          new mongoose.Types.ObjectId()
        ];
        const processingTime = 5000;

        await report.markAsProcessed(violationIds, processingTime);

        expect(report.status).toBe('processed');
        expect(report.parsedByLLM).toBe(true);
        expect(report.violation_ids).toEqual(violationIds);
        expect(report.processing_metadata.violations_created).toBe(2);
        expect(report.processing_metadata.processing_time_ms).toBe(processingTime);
        expect(report.processing_metadata.started_at).toBeNull();
        expect(report.error).toBeNull();
      });

      it('should handle empty violation IDs', async () => {
        await report.markAsProcessed([], 1000);

        expect(report.status).toBe('processed');
        expect(report.violation_ids).toEqual([]);
        expect(report.processing_metadata.violations_created).toBe(0);
      });

      it('should handle null violation IDs', async () => {
        await report.markAsProcessed(null, 1000);

        expect(report.status).toBe('processed');
        expect(report.violation_ids).toEqual([]);
        expect(report.processing_metadata.violations_created).toBe(0);
      });
    });

    describe('markAsFailed', () => {
      it('should mark as retry_pending for first failure', async () => {
        const errorMessage = 'Test error message';

        await report.markAsFailed(errorMessage);

        expect(report.status).toBe('retry_pending');
        expect(report.error).toBe(errorMessage);
        expect(report.processing_metadata.error_details).toBe(errorMessage);
        expect(report.processing_metadata.started_at).toBeNull();
      });

      it('should mark as failed after max attempts', async () => {
        const errorMessage = 'Test error message';
        
        // Set attempts to 3 (max)
        report.processing_metadata.attempts = 3;
        await report.save();

        await report.markAsFailed(errorMessage);

        expect(report.status).toBe('failed');
        expect(report.error).toBe(errorMessage);
      });

      it('should handle retry logic correctly', async () => {
        const errorMessage = 'Test error message';
        
        // First failure - should retry
        await report.markAsFailed(errorMessage);
        expect(report.status).toBe('retry_pending');

        // Set attempts to 2
        report.processing_metadata.attempts = 2;
        await report.save();
        
        // Second failure - should still retry
        await report.markAsFailed(errorMessage);
        expect(report.status).toBe('retry_pending');

        // Set attempts to 3 (max)
        report.processing_metadata.attempts = 3;
        await report.save();
        
        // Third failure - should fail permanently
        await report.markAsFailed(errorMessage);
        expect(report.status).toBe('failed');
      });
    });

    describe('markAsIgnored', () => {
      it('should mark report as ignored with reason', async () => {
        const reason = 'No violations found';

        await report.markAsIgnored(reason);

        expect(report.status).toBe('ignored');
        expect(report.error).toBe(reason);
        expect(report.processing_metadata.error_details).toBe(reason);
        expect(report.processing_metadata.started_at).toBeNull();
      });
    });
  });

  describe('Static Methods', () => {
    describe('findReadyForProcessing', () => {
      beforeEach(async () => {
        // Create test reports with different statuses
        const now = new Date();
        const thirtyMinutesAgo = new Date(now.getTime() - 31 * 60 * 1000);
        const tenMinutesAgo = new Date(now.getTime() - 10 * 60 * 1000);
        const fiveMinutesAgo = new Date(now.getTime() - 6 * 60 * 1000);

        const reports = [
          // Fresh unprocessed report
          {
            source_url: 'https://t.me/test/1',
            text: 'Unprocessed report text with enough characters',
            date: now,
            status: 'unprocessed',
            metadata: { channel: 'test', messageId: '1', scrapedAt: now }
          },
          // Retry pending report with enough wait time
          {
            source_url: 'https://t.me/test/2',
            text: 'Retry pending report text with enough characters',
            date: now,
            status: 'retry_pending',
            processing_metadata: {
              attempts: 1,
              last_attempt: thirtyMinutesAgo
            },
            metadata: { channel: 'test', messageId: '2', scrapedAt: now }
          },
          // Stuck processing report
          {
            source_url: 'https://t.me/test/3',
            text: 'Stuck processing report text with enough characters',
            date: now,
            status: 'processing',
            processing_metadata: {
              attempts: 1,
              started_at: tenMinutesAgo
            },
            metadata: { channel: 'test', messageId: '3', scrapedAt: now }
          },
          // Processed report (should not be included)
          {
            source_url: 'https://t.me/test/4',
            text: 'Processed report text with enough characters',
            date: now,
            status: 'processed',
            parsedByLLM: true,
            metadata: { channel: 'test', messageId: '4', scrapedAt: now }
          },
          // Retry pending but not enough wait time
          {
            source_url: 'https://t.me/test/5',
            text: 'Recent retry pending report text with enough characters',
            date: now,
            status: 'retry_pending',
            processing_metadata: {
              attempts: 1,
              last_attempt: tenMinutesAgo
            },
            metadata: { channel: 'test', messageId: '5', scrapedAt: now }
          },
          // Processing but not stuck yet
          {
            source_url: 'https://t.me/test/6',
            text: 'Recent processing report text with enough characters',
            date: now,
            status: 'processing',
            processing_metadata: {
              attempts: 1,
              started_at: fiveMinutesAgo
            },
            metadata: { channel: 'test', messageId: '6', scrapedAt: now }
          },
          // Max attempts reached
          {
            source_url: 'https://t.me/test/7',
            text: 'Max attempts report text with enough characters',
            date: now,
            status: 'retry_pending',
            processing_metadata: {
              attempts: 3,
              last_attempt: thirtyMinutesAgo
            },
            metadata: { channel: 'test', messageId: '7', scrapedAt: now }
          }
        ];

        await Report.insertMany(reports);
      });

      it('should find reports ready for processing', async () => {
        const readyReports = await Report.findReadyForProcessing(15);

        expect(readyReports).toHaveLength(3);
        
        // Should include: unprocessed, retry_pending with enough wait, stuck processing
        const statuses = readyReports.map(r => r.status);
        expect(statuses).toContain('unprocessed');
        expect(statuses).toContain('retry_pending');
        expect(statuses).toContain('processing');
      });

      it('should respect the limit parameter', async () => {
        const readyReports = await Report.findReadyForProcessing(2);
        expect(readyReports.length).toBeLessThanOrEqual(2);
      });

      it('should sort by scrapedAt in descending order', async () => {
        const readyReports = await Report.findReadyForProcessing(15);
        
        for (let i = 0; i < readyReports.length - 1; i++) {
          expect(readyReports[i].metadata.scrapedAt.getTime())
            .toBeGreaterThanOrEqual(readyReports[i + 1].metadata.scrapedAt.getTime());
        }
      });
    });

    describe('sanitizeData', () => {
      it('should initialize processing metadata', () => {
        const reportData = {
          source_url: 'https://t.me/test/1',
          text: 'Test report text',
          date: new Date(),
          metadata: {
            channel: 'test',
            messageId: '1'
          }
        };

        const sanitized = Report.sanitizeData(reportData);

        expect(sanitized.processing_metadata).toBeDefined();
        expect(sanitized.processing_metadata.attempts).toBe(0);
        expect(sanitized.processing_metadata.violations_created).toBe(0);
        expect(sanitized.violation_ids).toEqual([]);
        expect(sanitized.status).toBe('unprocessed');
      });

      it('should preserve existing processing metadata', () => {
        const reportData = {
          source_url: 'https://t.me/test/1',
          text: 'Test report text',
          date: new Date(),
          processing_metadata: {
            attempts: 2,
            violations_created: 5
          },
          metadata: {
            channel: 'test',
            messageId: '1'
          }
        };

        const sanitized = Report.sanitizeData(reportData);

        expect(sanitized.processing_metadata.attempts).toBe(2);
        expect(sanitized.processing_metadata.violations_created).toBe(5);
      });
    });
  });

  describe('Indexes', () => {
    it('should have proper indexes for batch processing', async () => {
      const indexes = await Report.collection.getIndexes();
      
      // Check if the processing index exists
      const processingIndex = Object.keys(indexes).find(key => 
        key.includes('status') && 
        key.includes('processing_metadata.attempts') && 
        key.includes('metadata.scrapedAt')
      );
      
      expect(processingIndex).toBeDefined();
      
      // Check if violation_ids index exists
      const violationIndex = Object.keys(indexes).find(key => key.includes('violation_ids'));
      expect(violationIndex).toBeDefined();
      
      // Check if last_attempt index exists
      const lastAttemptIndex = Object.keys(indexes).find(key => 
        key.includes('processing_metadata.last_attempt')
      );
      expect(lastAttemptIndex).toBeDefined();
    });
  });
});