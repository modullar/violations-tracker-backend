const mongoose = require('mongoose');
const ReportParsingJob = require('../../models/jobs/ReportParsingJob');
const { parseReport, getJobStatus, getAllJobs } = require('../../controllers/reportController');
const queueService = require('../../services/queueService');
const ErrorResponse = require('../../utils/errorResponse');
const request = require('supertest');
const app = require('../../server');
const Report = require('../../models/Report');
const User = require('../../models/User');
const { connectDB, closeDB } = require('../setup');
const jwt = require('jsonwebtoken');

// Mock dependencies
jest.mock('../../services/queueService');
jest.mock('../../config/logger');

describe('Report Controller Tests', () => {
  let req, res, next;
  let server;
  let adminToken;
  let editorToken;
  let userToken;
  let adminUser;
  let editorUser;
  let regularUser;

  beforeAll(async () => {
    await connectDB();
    server = app.listen(0);

    // Create test users
    adminUser = await User.create({
      name: 'Admin User',
      email: 'admin@test.com',
      password: 'password123',
      role: 'admin'
    });

    editorUser = await User.create({
      name: 'Editor User',
      email: 'editor@test.com',
      password: 'password123',
      role: 'editor'
    });

    regularUser = await User.create({
      name: 'Regular User',
      email: 'user@test.com',
      password: 'password123',
      role: 'user'
    });

    // Generate tokens
    adminToken = jwt.sign({ id: adminUser._id }, process.env.JWT_SECRET, { expiresIn: '30d' });
    editorToken = jwt.sign({ id: editorUser._id }, process.env.JWT_SECRET, { expiresIn: '30d' });
    userToken = jwt.sign({ id: regularUser._id }, process.env.JWT_SECRET, { expiresIn: '30d' });
  });

  afterAll(async () => {
    await server.close();
    await closeDB();
  });

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
        id: new mongoose.Types.ObjectId(),
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
        _id: new mongoose.Types.ObjectId(),
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
      const jobId = new mongoose.Types.ObjectId();
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
          violations: [new mongoose.Types.ObjectId(), new mongoose.Types.ObjectId(), new mongoose.Types.ObjectId()],
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
      req.params.jobId = new mongoose.Types.ObjectId();

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
      const jobId = new mongoose.Types.ObjectId();
      req.params.jobId = jobId;
      req.user.role = 'editor';
      req.user.id = new mongoose.Types.ObjectId();

      const mockJob = {
        _id: jobId,
        submittedBy: {
          _id: new mongoose.Types.ObjectId(), // Different from req.user.id
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
          _id: new mongoose.Types.ObjectId(),
          status: 'completed',
          progress: 100,
          submittedBy: { name: 'User 1' },
          createdAt: new Date()
        },
        {
          _id: new mongoose.Types.ObjectId(),
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

  describe('GET /api/reports', () => {
    beforeEach(async () => {
      // Create test reports
      const reports = [
        {
          source_url: 'https://t.me/channel1/1',
          text: 'First report about قصف in حلب',
          date: new Date('2024-01-15'),
          parsedByLLM: false,
          status: 'new',
          metadata: {
            channel: 'channel1',
            messageId: '1',
            scrapedAt: new Date('2024-01-15T10:00:00Z'),
            matchedKeywords: ['قصف', 'حلب'],
            language: 'ar',
            mediaCount: 1,
            viewCount: 100
          }
        },
        {
          source_url: 'https://t.me/channel2/1',
          text: 'Second report about انفجار in دمشق',
          date: new Date('2024-01-16'),
          parsedByLLM: true,
          status: 'parsed',
          metadata: {
            channel: 'channel2',
            messageId: '1',
            scrapedAt: new Date('2024-01-16T10:00:00Z'),
            matchedKeywords: ['انفجار', 'دمشق'],
            language: 'ar',
            mediaCount: 0,
            viewCount: 200
          }
        },
        {
          source_url: 'https://t.me/channel1/2',
          text: 'Third report in English about explosion',
          date: new Date('2024-01-17'),
          parsedByLLM: false,
          status: 'failed',
          metadata: {
            channel: 'channel1',
            messageId: '2',
            scrapedAt: new Date('2024-01-17T10:00:00Z'),
            matchedKeywords: ['explosion'],
            language: 'en',
            mediaCount: 2,
            viewCount: 50
          }
        }
      ];

      await Report.insertMany(reports);
    });

    it('should get all reports with default pagination', async () => {
      const res = await request(app)
        .get('/api/reports')
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(3);
      expect(res.body.count).toBe(3);
      expect(res.body.pagination).toBeDefined();
      expect(res.body.pagination.page).toBe(1);
    });

    it('should filter reports by channel', async () => {
      const res = await request(app)
        .get('/api/reports?channel=channel1')
        .expect(200);

      expect(res.body.data).toHaveLength(2);
      expect(res.body.data.every(report => report.metadata.channel === 'channel1')).toBe(true);
    });

    it('should filter reports by parsedByLLM status', async () => {
      const res = await request(app)
        .get('/api/reports?parsedByLLM=true')
        .expect(200);

      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].parsedByLLM).toBe(true);
    });

    it('should filter reports by language', async () => {
      const res = await request(app)
        .get('/api/reports?language=en')
        .expect(200);

      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].metadata.language).toBe('en');
    });

    it('should filter reports by status', async () => {
      const res = await request(app)
        .get('/api/reports?status=failed')
        .expect(200);

      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].status).toBe('failed');
    });

    it('should filter reports by date range', async () => {
      const res = await request(app)
        .get('/api/reports?startDate=2024-01-16&endDate=2024-01-17')
        .expect(200);

      expect(res.body.data).toHaveLength(2);
    });

    it('should filter reports by keyword', async () => {
      const res = await request(app)
        .get('/api/reports?keyword=قصف')
        .expect(200);

      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].metadata.matchedKeywords).toContain('قصف');
    });

    it('should support pagination', async () => {
      const res = await request(app)
        .get('/api/reports?page=2&limit=2')
        .expect(200);

      expect(res.body.pagination.page).toBe(2);
      expect(res.body.pagination.limit).toBe(2);
      expect(res.body.data).toHaveLength(1); // Only 1 item on page 2 with limit 2
    });

    it('should support sorting', async () => {
      const res = await request(app)
        .get('/api/reports?sort=date')
        .expect(200);

      const dates = res.body.data.map(report => new Date(report.date));
      for (let i = 1; i < dates.length; i++) {
        expect(dates[i]).toBeGreaterThanOrEqual(dates[i - 1]);
      }
    });
  });

  describe('GET /api/reports/:id', () => {
    let testReport;

    beforeEach(async () => {
      testReport = await Report.create({
        source_url: 'https://t.me/testchannel/123',
        text: 'Test report for ID endpoint',
        date: new Date(),
        metadata: {
          channel: 'testchannel',
          messageId: '123',
          scrapedAt: new Date(),
          matchedKeywords: ['test'],
          language: 'en'
        }
      });
    });

    it('should get report by ID', async () => {
      const res = await request(app)
        .get(`/api/reports/${testReport._id}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data._id).toBe(testReport._id.toString());
      expect(res.body.data.text).toBe('Test report for ID endpoint');
    });

    it('should return 404 for non-existent report', async () => {
      const fakeId = '507f1f77bcf86cd799439011';
      
      const res = await request(app)
        .get(`/api/reports/${fakeId}`)
        .expect(404);

      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('not found');
    });

    it('should return 404 for invalid ID format', async () => {
      const res = await request(app)
        .get('/api/reports/invalid-id')
        .expect(404);

      expect(res.body.success).toBe(false);
    });
  });

  describe('GET /api/reports/stats', () => {
    beforeEach(async () => {
      const reports = [
        {
          source_url: 'https://t.me/channel1/1',
          text: 'Report 1',
          date: new Date(),
          parsedByLLM: true,
          status: 'parsed',
          metadata: {
            channel: 'channel1',
            messageId: '1',
            scrapedAt: new Date(),
            matchedKeywords: ['قصف', 'حلب'],
            language: 'ar'
          }
        },
        {
          source_url: 'https://t.me/channel2/1',
          text: 'Report 2',
          date: new Date(),
          parsedByLLM: false,
          status: 'new',
          metadata: {
            channel: 'channel2',
            messageId: '1',
            scrapedAt: new Date(),
            matchedKeywords: ['انفجار'],
            language: 'ar'
          }
        }
      ];

      await Report.insertMany(reports);
    });

    it('should get report statistics as admin', async () => {
      const res = await request(app)
        .get('/api/reports/stats')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.summary).toBeDefined();
      expect(res.body.data.summary.total).toBe(2);
      expect(res.body.data.summary.parsed).toBe(1);
      expect(res.body.data.summary.unparsed).toBe(1);
      expect(res.body.data.channels).toBeDefined();
      expect(res.body.data.languages).toBeDefined();
      expect(res.body.data.topKeywords).toBeDefined();
    });

    it('should deny access to non-admin users', async () => {
      const res = await request(app)
        .get('/api/reports/stats')
        .set('Authorization', `Bearer ${editorToken}`)
        .expect(403);

      expect(res.body.success).toBe(false);
    });

    it('should require authentication', async () => {
      const res = await request(app)
        .get('/api/reports/stats')
        .expect(401);

      expect(res.body.success).toBe(false);
    });
  });

  describe('GET /api/reports/ready-for-processing', () => {
    beforeEach(async () => {
      const reports = [
        {
          source_url: 'https://t.me/channel1/1',
          text: 'Ready report 1',
          date: new Date(),
          parsedByLLM: false,
          status: 'new',
          metadata: { channel: 'channel1', messageId: '1', scrapedAt: new Date() }
        },
        {
          source_url: 'https://t.me/channel1/2',
          text: 'Ready report 2',
          date: new Date(),
          parsedByLLM: false,
          status: 'new',
          metadata: { channel: 'channel1', messageId: '2', scrapedAt: new Date() }
        },
        {
          source_url: 'https://t.me/channel1/3',
          text: 'Already processed',
          date: new Date(),
          parsedByLLM: true,
          status: 'parsed',
          metadata: { channel: 'channel1', messageId: '3', scrapedAt: new Date() }
        }
      ];

      await Report.insertMany(reports);
    });

    it('should get reports ready for processing as admin', async () => {
      const res = await request(app)
        .get('/api/reports/ready-for-processing')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(2);
      expect(res.body.data.every(report => !report.parsedByLLM && report.status === 'new')).toBe(true);
    });

    it('should support limit parameter', async () => {
      const res = await request(app)
        .get('/api/reports/ready-for-processing?limit=1')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.data).toHaveLength(1);
    });

    it('should deny access to non-admin users', async () => {
      const res = await request(app)
        .get('/api/reports/ready-for-processing')
        .set('Authorization', `Bearer ${editorToken}`)
        .expect(403);

      expect(res.body.success).toBe(false);
    });
  });

  describe('PUT /api/reports/:id/mark-processed', () => {
    let testReport;

    beforeEach(async () => {
      testReport = await Report.create({
        source_url: 'https://t.me/testchannel/123',
        text: 'Test report to mark as processed',
        date: new Date(),
        parsedByLLM: false,
        status: 'new',
        metadata: {
          channel: 'testchannel',
          messageId: '123',
          scrapedAt: new Date()
        }
      });
    });

    it('should mark report as processed as admin', async () => {
      const jobId = '507f1f77bcf86cd799439011';

      const res = await request(app)
        .put(`/api/reports/${testReport._id}/mark-processed`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ jobId })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.parsedByLLM).toBe(true);
      expect(res.body.data.status).toBe('parsed');
    });

    it('should return 404 for non-existent report', async () => {
      const fakeId = '507f1f77bcf86cd799439011';

      const res = await request(app)
        .put(`/api/reports/${fakeId}/mark-processed`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ jobId: '507f1f77bcf86cd799439012' })
        .expect(404);

      expect(res.body.success).toBe(false);
    });

    it('should deny access to non-admin users', async () => {
      const res = await request(app)
        .put(`/api/reports/${testReport._id}/mark-processed`)
        .set('Authorization', `Bearer ${editorToken}`)
        .send({ jobId: '507f1f77bcf86cd799439011' })
        .expect(403);

      expect(res.body.success).toBe(false);
    });
  });

  describe('PUT /api/reports/:id/mark-failed', () => {
    let testReport;

    beforeEach(async () => {
      testReport = await Report.create({
        source_url: 'https://t.me/testchannel/123',
        text: 'Test report to mark as failed',
        date: new Date(),
        parsedByLLM: false,
        status: 'new',
        metadata: {
          channel: 'testchannel',
          messageId: '123',
          scrapedAt: new Date()
        }
      });
    });

    it('should mark report as failed as admin', async () => {
      const errorMessage = 'Processing timeout';

      const res = await request(app)
        .put(`/api/reports/${testReport._id}/mark-failed`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ errorMessage })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('failed');
      expect(res.body.data.error).toBe(errorMessage);
    });

    it('should use default error message if none provided', async () => {
      const res = await request(app)
        .put(`/api/reports/${testReport._id}/mark-failed`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({})
        .expect(200);

      expect(res.body.data.error).toBe('Processing failed');
    });

    it('should deny access to non-admin users', async () => {
      const res = await request(app)
        .put(`/api/reports/${testReport._id}/mark-failed`)
        .set('Authorization', `Bearer ${editorToken}`)
        .send({ errorMessage: 'Test error' })
        .expect(403);

      expect(res.body.success).toBe(false);
    });
  });
});