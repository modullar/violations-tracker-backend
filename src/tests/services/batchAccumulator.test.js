const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const batchAccumulator = require('../../services/batchAccumulator');
const claudeBatchService = require('../../services/claudeBatchService');
const ReportParsingJob = require('../../models/jobs/ReportParsingJob');
const ClaudeBatch = require('../../models/jobs/ClaudeBatch');

// Mock the claudeBatchService
jest.mock('../../services/claudeBatchService');

describe('BatchAccumulator Tests', () => {
  let mongoServer;
  let originalEnv;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    await mongoose.connect(mongoUri);
    
    // Store original environment
    originalEnv = { ...process.env };
  });

  afterAll(async () => {
    await mongoose.connection.close();
    await mongoServer.stop();
    
    // Restore environment
    process.env = originalEnv;
  });

  beforeEach(async () => {
    await ReportParsingJob.deleteMany({});
    await ClaudeBatch.deleteMany({});
    
    // Reset mocks
    jest.clearAllMocks();
    claudeBatchService.submitBatch.mockClear();
    
    // Set test environment variables
    process.env.ENABLE_BATCH_PROCESSING = 'true';
    process.env.BATCH_SIZE = '5';
    process.env.BATCH_MAX_WAIT_MS = '1000'; // 1 second for faster tests
    process.env.BATCH_MIN_SIZE = '2';
    process.env.BATCH_MAX_AGE_MS = '5000'; // 5 seconds
    
    // Reset accumulator state
    batchAccumulator.setBatchingEnabled(true);
    batchAccumulator.cleanup(); // Clear any existing timers
  });

  afterEach(() => {
    batchAccumulator.cleanup();
  });

  describe('Configuration', () => {
    it('should initialize with correct configuration', () => {
      const stats = batchAccumulator.getStats();
      
      expect(stats.batchingEnabled).toBe(true);
      expect(stats.config.batchSize).toBe(5);
      expect(stats.config.maxWaitTime).toBe(1000);
      expect(stats.config.minBatchSize).toBe(2);
      expect(stats.config.maxBatchAge).toBe(5000);
    });

    it('should disable batching when environment variable is false', () => {
      process.env.ENABLE_BATCH_PROCESSING = 'false';
      
      // Note: In real usage, you'd need to recreate the service instance
      // For testing, we'll use the setter method
      batchAccumulator.setBatchingEnabled(false);
      
      const stats = batchAccumulator.getStats();
      expect(stats.batchingEnabled).toBe(false);
    });
  });

  describe('addJobToBatch', () => {
    let testJob;

    beforeEach(async () => {
      const userId = new mongoose.Types.ObjectId();
      testJob = await ReportParsingJob.create({
        reportText: 'Test report about violations in Syria',
        sourceURL: { name: 'Test Source' },
        submittedBy: userId,
        status: 'queued',
        urgent: false,
        priority: 'normal'
      });
    });

    it('should successfully add job to batch', async () => {
      const result = await batchAccumulator.addJobToBatch(testJob._id);

      expect(result).toBe(true);

      // Verify job was marked as batched
      const updatedJob = await ReportParsingJob.findById(testJob._id);
      expect(updatedJob.status).toBe('batched');
      expect(updatedJob.batchInfo.processingMode).toBe('batch');
    });

    it('should reject urgent jobs', async () => {
      testJob.urgent = true;
      await testJob.save();

      const result = await batchAccumulator.addJobToBatch(testJob._id);

      expect(result).toBe(false);

      // Verify job was not modified
      const updatedJob = await ReportParsingJob.findById(testJob._id);
      expect(updatedJob.status).toBe('queued');
      expect(updatedJob.batchInfo.processingMode).toBe('individual');
    });

    it('should reject jobs with urgent priority', async () => {
      testJob.priority = 'urgent';
      await testJob.save();

      const result = await batchAccumulator.addJobToBatch(testJob._id);

      expect(result).toBe(false);
    });

    it('should reject very large reports', async () => {
      testJob.reportText = 'x'.repeat(150000); // 150k characters
      await testJob.save();

      const result = await batchAccumulator.addJobToBatch(testJob._id);

      expect(result).toBe(false);
    });

    it('should handle non-existent job gracefully', async () => {
      const nonExistentId = new mongoose.Types.ObjectId();
      
      const result = await batchAccumulator.addJobToBatch(nonExistentId);

      expect(result).toBe(false);
    });

    it('should skip when batching is disabled', async () => {
      batchAccumulator.setBatchingEnabled(false);

      const result = await batchAccumulator.addJobToBatch(testJob._id);

      expect(result).toBe(false);

      // Verify job was not modified
      const updatedJob = await ReportParsingJob.findById(testJob._id);
      expect(updatedJob.status).toBe('queued');
      expect(updatedJob.batchInfo.processingMode).toBe('individual');
    });
  });

  describe('triggerBatchSubmission', () => {
    let testJobs;

    beforeEach(async () => {
      const userId = new mongoose.Types.ObjectId();
      
      // Create test jobs and mark them as batched
      testJobs = [];
      for (let i = 0; i < 3; i++) {
        const job = await ReportParsingJob.create({
          reportText: `Test report ${i + 1} about violations`,
          sourceURL: { name: `Test Source ${i + 1}` },
          submittedBy: userId,
          status: 'batched',
          batchInfo: {
            processingMode: 'batch',
            batchSubmittedAt: new Date()
          }
        });
        testJobs.push(job);
      }
    });

    it('should successfully trigger batch submission', async () => {
      // Mock successful batch submission
      const mockBatch = { 
        batchId: 'msgbatch_test123', 
        _id: new mongoose.Types.ObjectId() 
      };
      claudeBatchService.submitBatch.mockResolvedValue(mockBatch);

      const result = await batchAccumulator.triggerBatchSubmission('manual');

      expect(result.success).toBe(true);
      expect(result.batchId).toBe('msgbatch_test123');
      expect(result.jobCount).toBe(3);
      expect(result.trigger).toBe('manual');
      expect(claudeBatchService.submitBatch).toHaveBeenCalledWith(
        expect.arrayContaining(testJobs.map(job => expect.objectContaining({ _id: job._id })))
      );
    });

    it('should handle batch submission failure', async () => {
      // Mock batch submission failure
      claudeBatchService.submitBatch.mockRejectedValue(new Error('Claude API error'));

      const result = await batchAccumulator.triggerBatchSubmission('manual');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Claude API error');
      expect(result.trigger).toBe('manual');
    });

    it('should skip if no jobs are available', async () => {
      // Remove all batched jobs
      await ReportParsingJob.updateMany({}, { status: 'queued' });

      const result = await batchAccumulator.triggerBatchSubmission('manual');

      expect(result.skipped).toBe(true);
      expect(result.reason).toBe('no_jobs');
      expect(claudeBatchService.submitBatch).not.toHaveBeenCalled();
    });

    it('should skip if insufficient jobs (except for age limit)', async () => {
      // Remove jobs to get below minimum
      await ReportParsingJob.deleteMany({ _id: { $in: [testJobs[1]._id, testJobs[2]._id] } });

      const result = await batchAccumulator.triggerBatchSubmission('timer_timeout');

      expect(result.skipped).toBe(true);
      expect(result.reason).toBe('insufficient_jobs');
      expect(result.count).toBe(1);
      expect(claudeBatchService.submitBatch).not.toHaveBeenCalled();
    });

    it('should proceed with age limit trigger even with insufficient jobs', async () => {
      // Remove jobs to get below minimum
      await ReportParsingJob.deleteMany({ _id: { $in: [testJobs[1]._id, testJobs[2]._id] } });

      const mockBatch = { 
        batchId: 'msgbatch_test123', 
        _id: new mongoose.Types.ObjectId() 
      };
      claudeBatchService.submitBatch.mockResolvedValue(mockBatch);

      const result = await batchAccumulator.triggerBatchSubmission('age_limit');

      expect(result.success).toBe(true);
      expect(result.jobCount).toBe(1);
      expect(claudeBatchService.submitBatch).toHaveBeenCalled();
    });

    it('should handle all jobs filtered out', async () => {
      claudeBatchService.submitBatch.mockResolvedValue(null);

      const result = await batchAccumulator.triggerBatchSubmission('manual');

      expect(result.success).toBe(true);
      expect(result.batchId).toBeNull();
      expect(result.reason).toBe('all_jobs_filtered');
    });

    it('should prevent concurrent submissions', async () => {
      // Mock slow batch submission
      claudeBatchService.submitBatch.mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve({ batchId: 'test' }), 100))
      );

      // Trigger two submissions concurrently
      const [result1, result2] = await Promise.all([
        batchAccumulator.triggerBatchSubmission('manual'),
        batchAccumulator.triggerBatchSubmission('manual')
      ]);

      // One should succeed, one should be skipped
      const successCount = [result1, result2].filter(r => r.success).length;
      const skippedCount = [result1, result2].filter(r => r.skipped && r.reason === 'already_accumulating').length;

      expect(successCount).toBe(1);
      expect(skippedCount).toBe(1);
    });
  });

  describe('timer functionality', () => {
    it('should trigger batch after max wait time', async (done) => {
      const userId = new mongoose.Types.ObjectId();
      
      // Create a job and add to batch
      const job = await ReportParsingJob.create({
        reportText: 'Test report about violations',
        sourceURL: { name: 'Test Source' },
        submittedBy: userId,
        status: 'queued'
      });

      // Mock batch submission
      const mockBatch = { batchId: 'msgbatch_test123' };
      claudeBatchService.submitBatch.mockResolvedValue(mockBatch);

      await batchAccumulator.addJobToBatch(job._id);

      // Wait for timer to trigger
      setTimeout(async () => {
        expect(claudeBatchService.submitBatch).toHaveBeenCalled();
        done();
      }, 1100); // Slightly longer than maxWaitTime
    });

    it('should trigger immediately when batch size is reached', async () => {
      const userId = new mongoose.Types.ObjectId();
      
      // Mock batch submission
      const mockBatch = { batchId: 'msgbatch_test123' };
      claudeBatchService.submitBatch.mockResolvedValue(mockBatch);

      // Create enough jobs to trigger batch size threshold
      for (let i = 0; i < 5; i++) {
        const job = await ReportParsingJob.create({
          reportText: `Test report ${i + 1} about violations`,
          sourceURL: { name: `Test Source ${i + 1}` },
          submittedBy: userId,
          status: 'queued'
        });
        
        if (i < 4) {
          await batchAccumulator.addJobToBatch(job._id);
        } else {
          // The 5th job should trigger immediate submission
          await batchAccumulator.addJobToBatch(job._id);
          expect(claudeBatchService.submitBatch).toHaveBeenCalled();
        }
      }
    });
  });

  describe('checkBatchAge', () => {
    it('should trigger batch for old jobs', async () => {
      const userId = new mongoose.Types.ObjectId();
      
      // Create an old batched job
      const oldJob = await ReportParsingJob.create({
        reportText: 'Old test report about violations',
        sourceURL: { name: 'Test Source' },
        submittedBy: userId,
        status: 'batched',
        batchInfo: {
          processingMode: 'batch',
          batchSubmittedAt: new Date(Date.now() - 10000) // 10 seconds ago
        }
      });

      // Mock batch submission
      const mockBatch = { batchId: 'msgbatch_test123' };
      claudeBatchService.submitBatch.mockResolvedValue(mockBatch);

      const result = await batchAccumulator.checkBatchAge();

      expect(result).toBe(true);
      expect(claudeBatchService.submitBatch).toHaveBeenCalled();
    });

    it('should not trigger for recent jobs', async () => {
      const userId = new mongoose.Types.ObjectId();
      
      // Create a recent batched job
      const recentJob = await ReportParsingJob.create({
        reportText: 'Recent test report about violations',
        sourceURL: { name: 'Test Source' },
        submittedBy: userId,
        status: 'batched',
        batchInfo: {
          processingMode: 'batch',
          batchSubmittedAt: new Date() // Just now
        }
      });

      const result = await batchAccumulator.checkBatchAge();

      expect(result).toBe(false);
      expect(claudeBatchService.submitBatch).not.toHaveBeenCalled();
    });

    it('should handle no batched jobs', async () => {
      const result = await batchAccumulator.checkBatchAge();

      expect(result).toBe(false);
      expect(claudeBatchService.submitBatch).not.toHaveBeenCalled();
    });
  });

  describe('statistics and status', () => {
    it('should track statistics correctly', async () => {
      const initialStats = batchAccumulator.getStats();
      expect(initialStats.batchesSubmitted).toBe(0);
      expect(initialStats.jobsProcessed).toBe(0);

      // Mock successful batch submission
      const mockBatch = { batchId: 'msgbatch_test123' };
      claudeBatchService.submitBatch.mockResolvedValue(mockBatch);

      // Create and trigger batch
      const userId = new mongoose.Types.ObjectId();
      for (let i = 0; i < 3; i++) {
        await ReportParsingJob.create({
          reportText: `Test report ${i + 1}`,
          sourceURL: { name: `Source ${i + 1}` },
          submittedBy: userId,
          status: 'batched',
          batchInfo: { processingMode: 'batch', batchSubmittedAt: new Date() }
        });
      }

      await batchAccumulator.triggerBatchSubmission('manual');

      const updatedStats = batchAccumulator.getStats();
      expect(updatedStats.batchesSubmitted).toBe(1);
      expect(updatedStats.jobsProcessed).toBe(3);
      expect(updatedStats.lastBatchSize).toBe(3);
      expect(updatedStats.averageBatchSize).toBe(3);
    });

    it('should provide current batch status', async () => {
      const userId = new mongoose.Types.ObjectId();
      
      // Create batched jobs
      for (let i = 0; i < 2; i++) {
        await ReportParsingJob.create({
          reportText: `Test report ${i + 1}`,
          sourceURL: { name: `Source ${i + 1}` },
          submittedBy: userId,
          status: 'batched',
          batchInfo: { 
            processingMode: 'batch', 
            batchSubmittedAt: new Date(Date.now() - 1000) 
          }
        });
      }

      const status = await batchAccumulator.getBatchStatus();

      expect(status.queuedJobs).toBe(2);
      expect(status.oldestJobAge).toBeGreaterThan(0);
      expect(status.batchingEnabled).toBe(true);
      expect(status.isAccumulating).toBe(false);
    });

    it('should handle batch status errors gracefully', async () => {
      // Mock database error
      jest.spyOn(ReportParsingJob, 'findBatchedJobs').mockRejectedValue(new Error('DB error'));

      const status = await batchAccumulator.getBatchStatus();

      expect(status.error).toBe('DB error');
    });
  });

  describe('admin functions', () => {
    it('should force batch submission', async () => {
      const userId = new mongoose.Types.ObjectId();
      
      // Create batched job
      await ReportParsingJob.create({
        reportText: 'Test report about violations',
        sourceURL: { name: 'Test Source' },
        submittedBy: userId,
        status: 'batched',
        batchInfo: { processingMode: 'batch', batchSubmittedAt: new Date() }
      });

      // Mock batch submission
      const mockBatch = { batchId: 'msgbatch_test123' };
      claudeBatchService.submitBatch.mockResolvedValue(mockBatch);

      const result = await batchAccumulator.forceSubmission();

      expect(result.success).toBe(true);
      expect(result.trigger).toBe('manual');
      expect(claudeBatchService.submitBatch).toHaveBeenCalled();
    });

    it('should enable/disable batching', () => {
      batchAccumulator.setBatchingEnabled(false);
      expect(batchAccumulator.getStats().batchingEnabled).toBe(false);

      batchAccumulator.setBatchingEnabled(true);
      expect(batchAccumulator.getStats().batchingEnabled).toBe(true);
    });
  });

  describe('cleanup', () => {
    it('should cleanup timers properly', () => {
      // Start a timer
      batchAccumulator.startAccumulationTimer();
      expect(batchAccumulator.getStats().hasActiveTimer).toBe(true);

      // Cleanup
      batchAccumulator.cleanup();
      expect(batchAccumulator.getStats().hasActiveTimer).toBe(false);
    });
  });

  describe('fallback handling', () => {
    it('should fallback job to individual processing', async () => {
      const userId = new mongoose.Types.ObjectId();
      
      const job = await ReportParsingJob.create({
        reportText: 'Test report about violations',
        sourceURL: { name: 'Test Source' },
        submittedBy: userId,
        status: 'batched',
        batchInfo: { processingMode: 'batch' }
      });

      await batchAccumulator.fallbackJobToIndividual(job._id, 'Test error');

      const updatedJob = await ReportParsingJob.findById(job._id);
      expect(updatedJob.status).toBe('queued');
      expect(updatedJob.batchInfo.processingMode).toBe('individual');
    });

    it('should handle fallback errors gracefully', async () => {
      // Try to fallback non-existent job
      const nonExistentId = new mongoose.Types.ObjectId();
      
      // Should not throw error
      await expect(
        batchAccumulator.fallbackJobToIndividual(nonExistentId, 'Test error')
      ).resolves.not.toThrow();
    });
  });
});