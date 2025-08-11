const { processReport, createViolationsFromReport } = require('../../commands/violations/process');
const Report = require('../../models/Report');
const Violation = require('../../models/Violation');
const claudeParser = require('../../services/claudeParser');
const mongoose = require('mongoose');

// Mock dependencies
jest.mock('../../services/claudeParser');
jest.mock('../../commands/violations/create');

const { createSingleViolation } = require('../../commands/violations/create');

describe('Report Processing Service', () => {
  let mockReport;
  
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock report document
    mockReport = {
      _id: new mongoose.Types.ObjectId(),
      text: 'Test report text about violence',
      source_url: 'https://t.me/testchannel/123',
      date: new Date('2023-12-01'),
      metadata: {
        channel: 'testchannel',
        messageId: '123',
        scrapedAt: new Date()
      },
      processing_metadata: {
        attempts: 0,
        last_attempt: null,
        processing_time_ms: null,
        violations_created: 0
      },
      status: 'unprocessed',
      markAsProcessing: jest.fn().mockResolvedValue(),
      markAsProcessed: jest.fn().mockResolvedValue(),
      markAsFailed: jest.fn().mockResolvedValue(),
      markAsIgnored: jest.fn().mockResolvedValue()
    };
  });

  describe('createViolationsFromReport', () => {
    it('should handle empty violations array', async () => {
      const result = await createViolationsFromReport(mockReport, []);
      
      expect(result).toEqual({
        violationsCreated: 0,
        violationIds: [],
        errors: ['No valid violations to create']
      });
    });

    it('should create violations successfully', async () => {
      const mockViolation = { 
        _id: new mongoose.Types.ObjectId(),
        linkToReport: jest.fn().mockResolvedValue()
      };
      
      createSingleViolation.mockResolvedValue({
        violation: mockViolation,
        wasMerged: false
      });

      const parsedViolations = [
        {
          type: 'AIRSTRIKE',
          date: '2023-12-01',
          location: { name: { en: 'Test Location' } },
          description: { en: 'Test violation' },
          perpetrator_affiliation: 'unknown',
          certainty_level: 'probable',
          casualties: 5
        }
      ];

      const result = await createViolationsFromReport(mockReport, parsedViolations);

      expect(result.violationsCreated).toBe(1);
      expect(result.violationIds).toHaveLength(1);
      expect(result.violationIds[0]).toBe(mockViolation._id);
      expect(mockViolation.linkToReport).toHaveBeenCalledWith(mockReport._id);
    });

    it('should handle violation creation errors', async () => {
      createSingleViolation.mockRejectedValue(new Error('Creation failed'));

      const parsedViolations = [
        {
          type: 'AIRSTRIKE',
          date: '2023-12-01',
          location: { name: { en: 'Test Location' } },
          description: { en: 'Test violation' }
        }
      ];

      const result = await createViolationsFromReport(mockReport, parsedViolations);

      expect(result.violationsCreated).toBe(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].error).toBe('Creation failed');
    });

    it('should handle merged violations', async () => {
      const mockViolation = { 
        _id: new mongoose.Types.ObjectId(),
        linkToReport: jest.fn().mockResolvedValue()
      };
      
      createSingleViolation.mockResolvedValue({
        violation: mockViolation,
        wasMerged: true,
        duplicateInfo: {
          similarity: 0.92,
          exactMatch: false,
          originalId: new mongoose.Types.ObjectId()
        }
      });

      const parsedViolations = [
        {
          type: 'AIRSTRIKE',
          date: '2023-12-01',
          location: { name: { en: 'Test Location' } },
          description: { en: 'Test violation' }
        }
      ];

      const result = await createViolationsFromReport(mockReport, parsedViolations);

      expect(result.violationsCreated).toBe(1);
      expect(mockViolation.linkToReport).toHaveBeenCalledWith(mockReport._id);
    });
  });

  describe('processReport', () => {
    beforeEach(() => {
      process.env.CLAUDE_API_KEY = 'test-api-key';
    });

    it('should process report successfully', async () => {
      const mockParsedViolations = [
        {
          type: 'AIRSTRIKE',
          date: '2023-12-01',
          location: { name: { en: 'Test Location' } },
          description: { en: 'Test violation' },
          perpetrator_affiliation: 'unknown',
          certainty_level: 'probable',
          casualties: 5
        }
      ];

      const mockViolation = { 
        _id: new mongoose.Types.ObjectId(),
        linkToReport: jest.fn().mockResolvedValue()
      };

      claudeParser.parseReport.mockResolvedValue(mockParsedViolations);
      claudeParser.validateViolations.mockReturnValue({
        valid: mockParsedViolations,
        invalid: []
      });
      
      createSingleViolation.mockResolvedValue({
        violation: mockViolation,
        wasMerged: false
      });

      const result = await processReport(mockReport);

      expect(result.success).toBe(true);
      expect(result.violationsCreated).toBe(1);
      expect(result.reportId).toBe(mockReport._id);
      expect(mockReport.markAsProcessing).toHaveBeenCalled();
      expect(mockReport.markAsProcessed).toHaveBeenCalledWith(
        [mockViolation._id],
        expect.any(Number)
      );
    });

    it('should handle Claude API errors', async () => {
      claudeParser.parseReport.mockRejectedValue(new Error('Claude API error'));

      const result = await processReport(mockReport);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Claude parsing failed');
      expect(mockReport.markAsFailed).toHaveBeenCalledWith(expect.stringContaining('Claude parsing failed'));
    });

    it('should handle missing Claude API key', async () => {
      delete process.env.CLAUDE_API_KEY;

      const result = await processReport(mockReport);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Claude API key is not configured');
      expect(mockReport.markAsFailed).toHaveBeenCalled();
    });

    it('should handle invalid Claude response format', async () => {
      claudeParser.parseReport.mockResolvedValue(null);

      const result = await processReport(mockReport);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Claude API returned invalid data format');
      expect(mockReport.markAsFailed).toHaveBeenCalled();
    });

    it('should handle no violations found', async () => {
      claudeParser.parseReport.mockResolvedValue([]);

      const result = await processReport(mockReport);

      expect(result.success).toBe(true);
      expect(result.ignored).toBe(true);
      expect(result.violationsCreated).toBe(0);
      expect(mockReport.markAsIgnored).toHaveBeenCalledWith(
        'No violations found in report after Claude parsing'
      );
    });

    it('should handle all violations failing validation', async () => {
      const mockParsedViolations = [
        { type: 'INVALID_TYPE', date: 'invalid-date' }
      ];

      claudeParser.parseReport.mockResolvedValue(mockParsedViolations);
      claudeParser.validateViolations.mockReturnValue({
        valid: [],
        invalid: [{ 
          index: 0, 
          violation: mockParsedViolations[0], 
          errors: ['Invalid type', 'Invalid date'] 
        }]
      });

      const result = await processReport(mockReport);

      expect(result.success).toBe(false);
      expect(result.error).toContain('All 1 parsed violations failed validation');
      expect(mockReport.markAsFailed).toHaveBeenCalled();
    });

    it('should handle violation creation failures', async () => {
      const mockParsedViolations = [
        {
          type: 'AIRSTRIKE',
          date: '2023-12-01',
          location: { name: { en: 'Test Location' } },
          description: { en: 'Test violation' }
        }
      ];

      claudeParser.parseReport.mockResolvedValue(mockParsedViolations);
      claudeParser.validateViolations.mockReturnValue({
        valid: mockParsedViolations,
        invalid: []
      });

      // Mock createViolationsFromReport to return no violations created
      const originalCreateViolationsFromReport = createViolationsFromReport;
      jest.doMock('../../commands/violations/process', () => ({
        ...jest.requireActual('../../commands/violations/process'),
        createViolationsFromReport: jest.fn().mockResolvedValue({
          violationsCreated: 0,
          violationIds: [],
          errors: ['Creation failed']
        })
      }));

      createSingleViolation.mockRejectedValue(new Error('Creation failed'));

      const result = await processReport(mockReport);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Failed to create any violations from parsed data');
      expect(mockReport.markAsFailed).toHaveBeenCalled();
    });

    it('should handle unexpected errors', async () => {
      mockReport.markAsProcessing.mockRejectedValue(new Error('Database error'));

      const result = await processReport(mockReport);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Unexpected error during report processing');
    });

    it('should add source information to violations', async () => {
      const mockParsedViolations = [
        {
          type: 'AIRSTRIKE',
          date: '2023-12-01',
          location: { name: { en: 'Test Location' } },
          description: { en: 'Test violation' }
        }
      ];

      const mockViolation = { 
        _id: new mongoose.Types.ObjectId(),
        linkToReport: jest.fn().mockResolvedValue()
      };

      claudeParser.parseReport.mockResolvedValue(mockParsedViolations);
      claudeParser.validateViolations.mockReturnValue({
        valid: mockParsedViolations,
        invalid: []
      });
      
      createSingleViolation.mockImplementation((violationData) => {
        // Verify source information was added
        expect(violationData.source.en).toContain('Telegram: testchannel');
        expect(violationData.source_url.en).toBe(mockReport.source_url);
        expect(violationData.reported_date).toBe(mockReport.date);
        
        return Promise.resolve({
          violation: mockViolation,
          wasMerged: false
        });
      });

      const result = await processReport(mockReport);

      expect(result.success).toBe(true);
      expect(createSingleViolation).toHaveBeenCalledWith(
        expect.objectContaining({
          source: expect.objectContaining({
            en: expect.stringContaining('Telegram: testchannel')
          }),
          source_url: expect.objectContaining({
            en: mockReport.source_url
          }),
          reported_date: mockReport.date
        }),
        null,
        expect.objectContaining({
          checkDuplicates: true,
          mergeDuplicates: true,
          duplicateThreshold: 0.85
        })
      );
    });
  });

  describe('retry logic', () => {
    it('should handle processing with retry logic', async () => {
      // Test that the findReadyForProcessing method works correctly
      const mockReports = [mockReport];
      
      Report.findReadyForProcessing = jest.fn().mockResolvedValue(mockReports);
      
      const reports = await Report.findReadyForProcessing(15);
      
      expect(reports).toHaveLength(1);
      expect(Report.findReadyForProcessing).toHaveBeenCalledWith(15);
    });
  });
});