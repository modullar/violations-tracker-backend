const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const nock = require('nock');
const claudeBatchService = require('../../services/claudeBatchService');
const ClaudeBatch = require('../../models/jobs/ClaudeBatch');
const ReportParsingJob = require('../../models/jobs/ReportParsingJob');
const textPreprocessor = require('../../utils/textPreprocessor');

// Mock the textPreprocessor
jest.mock('../../utils/textPreprocessor');

describe('ClaudeBatchService Tests', () => {
  let mongoServer;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    await mongoose.connect(mongoUri);
  });

  afterAll(async () => {
    await mongoose.connection.close();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    await ClaudeBatch.deleteMany({});
    await ReportParsingJob.deleteMany({});
    
    // Clear all nock interceptors
    nock.cleanAll();
    
    // Reset mocks
    jest.clearAllMocks();
    
    // Set default environment variables
    process.env.CLAUDE_API_KEY = 'test-api-key';
    process.env.CLAUDE_MODEL = 'claude-3-5-sonnet-20241022';
    process.env.CLAUDE_MAX_TOKENS = '4096';
    process.env.CLAUDE_MAX_BATCH_SIZE = '50';
    process.env.CLAUDE_MAX_BATCH_SIZE_MB = '200';
  });

  afterEach(() => {
    nock.cleanAll();
  });

  describe('Configuration', () => {
    it('should have correct default configuration', () => {
      const config = claudeBatchService.getConfig();
      
      expect(config.model).toBe('claude-3-5-sonnet-20241022');
      expect(config.maxTokens).toBe(4096);
      expect(config.maxBatchSize).toBe(50);
      expect(config.maxBatchSizeMB).toBe(200);
      expect(config.isConfigured).toBe(true);
    });

    it('should detect missing API key', () => {
      delete process.env.CLAUDE_API_KEY;
      expect(claudeBatchService.isConfigured()).toBe(false);
    });
  });

  describe('buildSourceInfo', () => {
    it('should build source info correctly with all fields', () => {
      const sourceURL = {
        name: 'Test Source',
        url: 'https://example.com',
        reportDate: '2023-05-15'
      };

      const result = claudeBatchService.buildSourceInfo(sourceURL);
      expect(result).toBe('Report source: Test Source (https://example.com) published on 2023-05-15');
    });

    it('should handle missing URL and date', () => {
      const sourceURL = { name: 'Test Source' };
      const result = claudeBatchService.buildSourceInfo(sourceURL);
      expect(result).toBe('Report source: Test Source');
    });

    it('should handle missing source info', () => {
      const result = claudeBatchService.buildSourceInfo(null);
      expect(result).toBe('No source information provided');
    });
  });

  describe('estimateTokenCount', () => {
    it('should estimate token count correctly', () => {
      const text = 'This is a test text with multiple words';
      const result = claudeBatchService.estimateTokenCount(text);
      // Text length is 39, so estimated tokens = ceil(39/4) = 10
      expect(result).toBe(10);
    });

    it('should handle empty text', () => {
      const result = claudeBatchService.estimateTokenCount('');
      expect(result).toBe(0);
    });
  });

  describe('estimateBatchSize', () => {
    it('should estimate batch size in bytes', () => {
      const requests = [
        { custom_id: 'job_1', params: { model: 'test', messages: [] } },
        { custom_id: 'job_2', params: { model: 'test', messages: [] } }
      ];
      
      const result = claudeBatchService.estimateBatchSize(requests);
      expect(result).toBeGreaterThan(0);
      expect(typeof result).toBe('number');
    });
  });

  describe('buildBatchRequests', () => {
    let testJobs;

    beforeEach(async () => {
      const userId = new mongoose.Types.ObjectId();
      
      // Create test jobs
      testJobs = await ReportParsingJob.create([
        {
          reportText: 'This is a test report about violations',
          sourceURL: { name: 'Test Source 1' },
          submittedBy: userId
        },
        {
          reportText: 'Another test report with different content',
          sourceURL: { name: 'Test Source 2', url: 'https://example.com' },
          submittedBy: userId
        }
      ]);
    });

    it('should build batch requests for valid jobs', async () => {
      // Mock preprocessing to accept jobs
      textPreprocessor.shouldProcessWithClaude.mockReturnValue({
        shouldProcess: true,
        reason: 'Contains violation keywords',
        confidence: 0.95
      });

      const result = await claudeBatchService.buildBatchRequests(testJobs);

      expect(result.requests).toHaveLength(2);
      expect(result.validJobs).toHaveLength(2);
      expect(result.skippedJobs).toHaveLength(0);

      // Check request structure
      expect(result.requests[0]).toHaveProperty('custom_id', `job_${testJobs[0]._id}`);
      expect(result.requests[0]).toHaveProperty('params');
      expect(result.requests[0].params).toHaveProperty('model');
      expect(result.requests[0].params).toHaveProperty('max_tokens');
      expect(result.requests[0].params).toHaveProperty('system');
      expect(result.requests[0].params).toHaveProperty('messages');
    });

    it('should skip jobs that fail preprocessing', async () => {
      // Mock preprocessing to reject first job, accept second
      textPreprocessor.shouldProcessWithClaude
        .mockReturnValueOnce({
          shouldProcess: false,
          reason: 'Text too short',
          confidence: 0.8
        })
        .mockReturnValueOnce({
          shouldProcess: true,
          reason: 'Contains violation keywords',
          confidence: 0.95
        });

      const result = await claudeBatchService.buildBatchRequests(testJobs);

      expect(result.requests).toHaveLength(1);
      expect(result.validJobs).toHaveLength(1);
      expect(result.skippedJobs).toHaveLength(1);
      expect(result.skippedJobs[0].reason).toContain('Preprocessing filter');
    });

    it('should handle job processing errors', async () => {
      // Mock preprocessing to throw error
      textPreprocessor.shouldProcessWithClaude.mockImplementation(() => {
        throw new Error('Preprocessing error');
      });

      const result = await claudeBatchService.buildBatchRequests(testJobs);

      expect(result.requests).toHaveLength(0);
      expect(result.validJobs).toHaveLength(0);
      expect(result.skippedJobs).toHaveLength(2);
      expect(result.skippedJobs[0].reason).toContain('Processing error');
    });
  });

  describe('createBatchDocument', () => {
    it('should create batch document correctly', async () => {
      const userId = new mongoose.Types.ObjectId();
      const job = await ReportParsingJob.create({
        reportText: 'Test report text',
        sourceURL: { name: 'Test Source' },
        submittedBy: userId
      });

      const batchData = {
        id: 'msgbatch_test123',
        processing_status: 'in_progress',
        request_counts: {
          processing: 1,
          succeeded: 0,
          errored: 0,
          canceled: 0,
          expired: 0
        },
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
      };

      const validJobs = [{
        job,
        estimatedInputTokens: 100,
        preprocessingResult: { shouldProcess: true }
      }];

      const requests = [{
        custom_id: `job_${job._id}`,
        params: { model: 'test' }
      }];

      const result = await claudeBatchService.createBatchDocument(batchData, validJobs, requests);

      expect(result).toBeInstanceOf(ClaudeBatch);
      expect(result.batchId).toBe('msgbatch_test123');
      expect(result.status).toBe('submitted');
      expect(result.requests).toHaveLength(1);
      expect(result.requests[0].jobId).toEqual(job._id);
      expect(result.requests[0].inputTokens).toBe(100);
      expect(result.metadata.totalInputTokens).toBe(100);
    });
  });

  describe('submitBatch', () => {
    let testJobs;

    beforeEach(async () => {
      const userId = new mongoose.Types.ObjectId();
      
      testJobs = await ReportParsingJob.create([
        {
          reportText: 'Test report about violations in Syria',
          sourceURL: { name: 'Test Source 1' },
          submittedBy: userId,
          status: 'queued'
        },
        {
          reportText: 'Another report with detailed violation information',
          sourceURL: { name: 'Test Source 2' },
          submittedBy: userId,
          status: 'queued'
        }
      ]);
    });

    it('should successfully submit batch to Claude API', async () => {
      // Mock preprocessing
      textPreprocessor.shouldProcessWithClaude.mockReturnValue({
        shouldProcess: true,
        reason: 'Contains violation keywords',
        confidence: 0.95
      });

      // Mock Claude API response
      const mockBatchResponse = {
        id: 'msgbatch_test123',
        type: 'message_batch',
        processing_status: 'in_progress',
        request_counts: {
          processing: 2,
          succeeded: 0,
          errored: 0,
          canceled: 0,
          expired: 0
        },
        ended_at: null,
        created_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        cancel_initiated_at: null,
        results_url: null
      };

      nock('https://api.anthropic.com')
        .post('/v1/messages/batches')
        .reply(200, mockBatchResponse);

      const result = await claudeBatchService.submitBatch(testJobs);

      expect(result).toBeInstanceOf(ClaudeBatch);
      expect(result.batchId).toBe('msgbatch_test123');
      expect(result.requests).toHaveLength(2);

      // Verify jobs were updated
      const updatedJobs = await ReportParsingJob.find({ _id: { $in: testJobs.map(j => j._id) } });
      expect(updatedJobs.every(job => job.status === 'batch_submitted')).toBe(true);
      expect(updatedJobs.every(job => job.batchInfo.processingMode === 'batch')).toBe(true);
    });

    it('should handle Claude API errors and fallback jobs', async () => {
      // Mock preprocessing
      textPreprocessor.shouldProcessWithClaude.mockReturnValue({
        shouldProcess: true,
        reason: 'Contains violation keywords',
        confidence: 0.95
      });

      // Mock Claude API error
      nock('https://api.anthropic.com')
        .post('/v1/messages/batches')
        .reply(500, { error: 'Internal server error' });

      await expect(claudeBatchService.submitBatch(testJobs)).rejects.toThrow();

      // Verify jobs were fell back to individual processing
      const updatedJobs = await ReportParsingJob.find({ _id: { $in: testJobs.map(j => j._id) } });
      expect(updatedJobs.every(job => job.status === 'queued')).toBe(true);
      expect(updatedJobs.every(job => job.batchInfo.processingMode === 'individual')).toBe(true);
    });

    it('should handle missing API key', async () => {
      delete process.env.CLAUDE_API_KEY;

      await expect(claudeBatchService.submitBatch(testJobs)).rejects.toThrow('Claude API key is not configured');
    });

    it('should handle empty job array', async () => {
      await expect(claudeBatchService.submitBatch([])).rejects.toThrow('No jobs provided for batch submission');
    });

    it('should handle all jobs being filtered out', async () => {
      // Mock preprocessing to reject all jobs
      textPreprocessor.shouldProcessWithClaude.mockReturnValue({
        shouldProcess: false,
        reason: 'Text too short',
        confidence: 0.8
      });

      const result = await claudeBatchService.submitBatch(testJobs);

      expect(result).toBeNull();

      // Verify jobs were marked as completed due to preprocessing
      const updatedJobs = await ReportParsingJob.find({ _id: { $in: testJobs.map(j => j._id) } });
      expect(updatedJobs.every(job => job.status === 'completed')).toBe(true);
      expect(updatedJobs.every(job => job.error?.includes('Preprocessing filter'))).toBe(true);
    });

    it('should handle batch size limit exceeded', async () => {
      // Create a very large request that exceeds size limit
      const largeJob = await ReportParsingJob.create({
        reportText: 'x'.repeat(250 * 1024 * 1024), // 250MB report
        sourceURL: { name: 'Large Source' },
        submittedBy: new mongoose.Types.ObjectId(),
        status: 'queued'
      });

      textPreprocessor.shouldProcessWithClaude.mockReturnValue({
        shouldProcess: true,
        reason: 'Contains violation keywords',
        confidence: 0.95
      });

      await expect(claudeBatchService.submitBatch([largeJob])).rejects.toThrow('Batch size');
    });
  });

  describe('handleSkippedJobs', () => {
    let testJob;

    beforeEach(async () => {
      const userId = new mongoose.Types.ObjectId();
      testJob = await ReportParsingJob.create({
        reportText: 'Test report text',
        sourceURL: { name: 'Test Source' },
        submittedBy: userId,
        status: 'queued'
      });
    });

    it('should handle preprocessing filter skipped jobs', async () => {
      const skippedJobs = [{
        job: testJob,
        reason: 'Preprocessing filter: Text too short',
        preprocessingResult: { shouldProcess: false, reason: 'Text too short' }
      }];

      await claudeBatchService.handleSkippedJobs(skippedJobs);

      const updatedJob = await ReportParsingJob.findById(testJob._id);
      expect(updatedJob.status).toBe('completed');
      expect(updatedJob.error).toContain('Preprocessing filter');
      expect(updatedJob.results.preprocessingResult).toBeDefined();
    });

    it('should handle processing error skipped jobs', async () => {
      const skippedJobs = [{
        job: testJob,
        reason: 'Processing error: Something went wrong',
        error: new Error('Something went wrong')
      }];

      await claudeBatchService.handleSkippedJobs(skippedJobs);

      const updatedJob = await ReportParsingJob.findById(testJob._id);
      expect(updatedJob.status).toBe('queued');
      expect(updatedJob.batchInfo.processingMode).toBe('individual');
    });
  });

  describe('updateJobsForBatch', () => {
    it('should update jobs correctly for batch submission', async () => {
      const userId = new mongoose.Types.ObjectId();
      const job = await ReportParsingJob.create({
        reportText: 'Test report text',
        sourceURL: { name: 'Test Source' },
        submittedBy: userId,
        status: 'queued'
      });

      const claudeBatch = await ClaudeBatch.create({
        batchId: 'msgbatch_test',
        requests: []
      });

      const validJobs = [{
        job,
        estimatedInputTokens: 100,
        preprocessingResult: { shouldProcess: true, analysis: {} }
      }];

      await claudeBatchService.updateJobsForBatch(validJobs, claudeBatch);

      const updatedJob = await ReportParsingJob.findById(job._id);
      expect(updatedJob.status).toBe('batch_submitted');
      expect(updatedJob.batchInfo.batchId).toEqual(claudeBatch._id);
      expect(updatedJob.batchInfo.customId).toBe(`job_${job._id}`);
      expect(updatedJob.results.preprocessingResult).toBeDefined();
    });
  });

  describe('fallbackJobsToIndividual', () => {
    it('should fallback jobs to individual processing', async () => {
      const userId = new mongoose.Types.ObjectId();
      const jobs = await ReportParsingJob.create([
        {
          reportText: 'Test report 1',
          sourceURL: { name: 'Test Source 1' },
          submittedBy: userId,
          status: 'batched'
        },
        {
          reportText: 'Test report 2',
          sourceURL: { name: 'Test Source 2' },
          submittedBy: userId,
          status: 'batched'
        }
      ]);

      await claudeBatchService.fallbackJobsToIndividual(jobs, 'Test error');

      const updatedJobs = await ReportParsingJob.find({ _id: { $in: jobs.map(j => j._id) } });
      expect(updatedJobs.every(job => job.status === 'queued')).toBe(true);
      expect(updatedJobs.every(job => job.batchInfo.processingMode === 'individual')).toBe(true);
    });
  });
});