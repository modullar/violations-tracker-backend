const mongoose = require('mongoose');
const ReportParsingJob = require('../../models/jobs/ReportParsingJob');
const { parseReport, getJobStatus, getAllJobs } = require('../../controllers/reportController');
const queueService = require('../../services/queueService');
const ErrorResponse = require('../../utils/errorResponse');

// Mock dependencies
jest.mock('../../services/queueService');
jest.mock('../../config/logger');

describe('Report Controller Tests', () => {
  let req, res, next;

  beforeEach(() => {
    req = {
      body: {
        reportText: 'This is a test report with sufficient length to pass the validation.',
        sourceURL: {
          name: 'Test Source',
          url: 'https://example.com',
          reportDate: '2025-01-01'
        }
      },
      params: {},
      query: {},
      user: {
        id: mongoose.Types.ObjectId(),
        role: 'admin'
      }
    };

    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };

    next = jest.fn();

    // Mock queue service
    queueService.addJob.mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('parseReport', () => {
    it('should create a new report parsing job and return job details', async () => {
      // Mock ReportParsingJob.create
      const mockJob = {
        _id: mongoose.Types.ObjectId(),
        createdAt: new Date(),
        reportText: req.body.reportText,
        sourceURL: req.body.sourceURL,
        status: 'queued',
        progress: 0,
        estimatedProcessingTime: '1 minutes'
      };

      ReportParsingJob.create = jest.fn().mockResolvedValue(mockJob);

      await parseReport(req, res, next);

      expect(ReportParsingJob.create).toHaveBeenCalledWith(
        expect.objectContaining({
          reportText: req.body.reportText,
          sourceURL: req.body.sourceURL,
          submittedBy: req.user.id,
          status: 'queued',
          progress: 0
        })
      );

      expect(queueService.addJob).toHaveBeenCalledWith(mockJob._id.toString());
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: expect.objectContaining({
          jobId: mockJob._id,
          estimatedProcessingTime: mockJob.estimatedProcessingTime,
          submittedAt: mockJob.createdAt
        })
      });
    });

    it('should return 400 if report text is too short', async () => {
      req.body.reportText = 'Too short';

      await parseReport(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.any(ErrorResponse)
      );
      expect(next.mock.calls[0][0].statusCode).toBe(400);
    });

    it('should return 400 if source name is missing when source URL is provided', async () => {
      req.body.sourceURL = { url: 'https://example.com' };

      await parseReport(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.any(ErrorResponse)
      );
      expect(next.mock.calls[0][0].statusCode).toBe(400);
    });
  });

  describe('getJobStatus', () => {
    it('should return job details for a valid job ID', async () => {
      const jobId = mongoose.Types.ObjectId();
      req.params.jobId = jobId;

      const mockJob = {
        _id: jobId,
        reportText: 'Test report',
        sourceURL: { name: 'Test Source' },
        status: 'completed',
        progress: 100,
        createdAt: new Date(),
        estimatedProcessingTime: '1 minutes',
        submittedBy: {
          _id: req.user.id,
          name: 'Test User'
        },
        error: null,
        results: {
          parsedViolationsCount: 5,
          createdViolationsCount: 3,
          violations: [mongoose.Types.ObjectId(), mongoose.Types.ObjectId(), mongoose.Types.ObjectId()],
          failedViolations: []
        }
      };

      ReportParsingJob.findById = jest.fn().mockReturnValue({
        populate: jest.fn().mockResolvedValue(mockJob)
      });

      await getJobStatus(req, res, next);

      expect(ReportParsingJob.findById).toHaveBeenCalledWith(jobId);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: expect.objectContaining({
          id: jobId,
          status: 'completed',
          progress: 100
        })
      });
    });

    it('should return 404 if job is not found', async () => {
      req.params.jobId = mongoose.Types.ObjectId();

      ReportParsingJob.findById = jest.fn().mockReturnValue({
        populate: jest.fn().mockResolvedValue(null)
      });

      await getJobStatus(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.any(ErrorResponse)
      );
      expect(next.mock.calls[0][0].statusCode).toBe(404);
    });

    it('should return 403 if user is not authorized to view the job', async () => {
      const jobId = mongoose.Types.ObjectId();
      req.params.jobId = jobId;
      req.user.role = 'editor';
      req.user.id = mongoose.Types.ObjectId();

      const mockJob = {
        _id: jobId,
        submittedBy: {
          _id: mongoose.Types.ObjectId(), // Different from req.user.id
          name: 'Different User'
        }
      };

      ReportParsingJob.findById = jest.fn().mockReturnValue({
        populate: jest.fn().mockResolvedValue(mockJob)
      });

      await getJobStatus(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.any(ErrorResponse)
      );
      expect(next.mock.calls[0][0].statusCode).toBe(403);
    });
  });

  describe('getAllJobs', () => {
    it('should return paginated list of jobs', async () => {
      req.query = { page: '1', limit: '10' };

      const mockJobs = [
        {
          _id: mongoose.Types.ObjectId(),
          status: 'completed',
          progress: 100,
          submittedBy: { name: 'User 1' },
          createdAt: new Date()
        },
        {
          _id: mongoose.Types.ObjectId(),
          status: 'processing',
          progress: 50,
          submittedBy: { name: 'User 2' },
          createdAt: new Date()
        }
      ];

      ReportParsingJob.countDocuments = jest.fn().mockResolvedValue(2);
      ReportParsingJob.find = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnThis(),
        populate: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue(mockJobs)
      });

      await getAllJobs(req, res, next);

      expect(ReportParsingJob.find).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        count: 2,
        pagination: expect.any(Object),
        data: mockJobs
      });
    });

    it('should filter jobs by status if provided', async () => {
      req.query = { status: 'completed' };

      ReportParsingJob.countDocuments = jest.fn().mockResolvedValue(1);
      ReportParsingJob.find = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnThis(),
        populate: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue([])
      });

      await getAllJobs(req, res, next);

      expect(ReportParsingJob.find).toHaveBeenCalledWith({ status: 'completed' });
    });
  });
});