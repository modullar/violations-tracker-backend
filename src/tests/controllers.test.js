const mongoose = require('mongoose');
const Violation = require('../models/Violation');
const User = require('../models/User');
const violationsController = require('../controllers/violationsController');
const authController = require('../controllers/authController');
const userController = require('../controllers/userController');

// Mock the geocoder utility
jest.mock('../utils/geocoder', () => ({
  geocodeLocation: jest.fn().mockImplementation(() => {
    return Promise.resolve([{
      latitude: 34.5,
      longitude: 35.5,
      formattedAddress: 'Test Location, Test Country'
    }]);
  })
}));

// Mock JWT
jest.mock('jsonwebtoken', () => ({
  sign: jest.fn().mockReturnValue('test-token')
}));

describe('Controller Tests', () => {
  describe('Violations Controller', () => {
    let req;
    let res;
    let next;
    
    beforeEach(() => {
      req = {
        params: {},
        query: {},
        body: {},
        user: { id: new mongoose.Types.ObjectId() }
      };
      
      res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis(),
        cookie: jest.fn().mockReturnThis()
      };
      
      next = jest.fn();
    });
    
    it('should get violations with pagination', async () => {
      // Mock Violation.paginate
      const mockResults = {
        docs: [{ type: 'AIRSTRIKE', description: 'Test' }],
        totalDocs: 1,
        page: 1,
        limit: 10,
        totalPages: 1,
        hasNextPage: false,
        hasPrevPage: false,
        nextPage: null,
        prevPage: null
      };
      
      Violation.paginate = jest.fn().mockResolvedValue(mockResults);
      
      await violationsController.getViolations(req, res, next);
      
      expect(Violation.paginate).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json.mock.calls[0][0]).toEqual({
        success: true,
        count: 1,
        pagination: expect.any(Object),
        data: mockResults.docs
      });
    });
    
    it('should get violations by radius', async () => {
      // Set params
      req.params = {
        latitude: '34.5',
        longitude: '35.5',
        radius: '10'
      };
      
      // Mock Violation.find
      const mockViolations = [{ type: 'AIRSTRIKE', description: 'Test' }];
      Violation.find = jest.fn().mockResolvedValue(mockViolations);
      
      await violationsController.getViolationsInRadius(req, res, next);
      
      expect(Violation.find).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json.mock.calls[0][0]).toEqual({
        success: true,
        count: 1,
        data: mockViolations
      });
    });
    
    it('should get a single violation by ID', async () => {
      // Set params
      const violationId = new mongoose.Types.ObjectId();
      req.params.id = violationId;
      
      // Mock violation
      const mockViolation = { 
        _id: violationId, 
        type: 'AIRSTRIKE', 
        description: 'Test',
        toObject: jest.fn().mockReturnThis()
      };
      
      // Mock Violation.findById
      const populateMock = jest.fn().mockResolvedValue(mockViolation);
      Violation.findById = jest.fn().mockReturnValue({
        populate: populateMock
      });
      
      await violationsController.getViolation(req, res, next);
      
      expect(Violation.findById).toHaveBeenCalledWith(violationId.toString());
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json.mock.calls[0][0]).toEqual({
        success: true,
        data: mockViolation
      });
    });
    
    it('should create a new violation', async () => {
      // Set request body
      req.body = {
        type: 'AIRSTRIKE',
        date: '2023-05-15',
        location: {
          name: 'Test Location',
          administrative_division: 'Test Division'
        },
        description: 'Test violation description',
        verified: true,
        certainty_level: 'confirmed'
      };
      
      // Mock Violation.create
      const mockCreatedViolation = {
        _id: new mongoose.Types.ObjectId(),
        ...req.body,
        location: {
          ...req.body.location,
          coordinates: [35.5, 34.5]
        },
        created_by: req.user.id,
        updated_by: req.user.id
      };
      
      Violation.create = jest.fn().mockResolvedValue(mockCreatedViolation);
      
      await violationsController.createViolation(req, res, next);
      
      expect(Violation.create).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json.mock.calls[0][0]).toEqual({
        success: true,
        data: mockCreatedViolation
      });
    });
    
    it('should update a violation', async () => {
      // Set params and body
      const violationId = new mongoose.Types.ObjectId();
      req.params.id = violationId;
      req.body = {
        description: 'Updated description',
        verified: false
      };
      
      // Mock existing violation
      const mockExistingViolation = {
        _id: violationId,
        type: 'AIRSTRIKE',
        date: new Date('2023-05-15'),
        location: {
          coordinates: [35.5, 34.5],
          name: 'Original Location',
          administrative_division: 'Original Division'
        },
        description: 'Original description',
        verified: true,
        certainty_level: 'confirmed'
      };
      
      // Mock updated violation
      const mockUpdatedViolation = {
        ...mockExistingViolation,
        description: req.body.description,
        verified: req.body.verified,
        updated_by: req.user.id
      };
      
      // Mock Violation.findById and findByIdAndUpdate
      Violation.findById = jest.fn().mockResolvedValue(mockExistingViolation);
      Violation.findByIdAndUpdate = jest.fn().mockResolvedValue(mockUpdatedViolation);
      
      await violationsController.updateViolation(req, res, next);
      
      expect(Violation.findById).toHaveBeenCalledWith(violationId.toString());
      expect(Violation.findByIdAndUpdate).toHaveBeenCalledWith(
        violationId.toString(),
        { ...req.body, updated_by: req.user.id },
        { new: true, runValidators: true }
      );
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json.mock.calls[0][0]).toEqual({
        success: true,
        data: mockUpdatedViolation
      });
    });
    
    it('should return 404 when updating non-existent violation', async () => {
      // Set params
      req.params.id = new mongoose.Types.ObjectId();
      
      // Mock Violation.findById to return null
      Violation.findById = jest.fn().mockResolvedValue(null);
      
      await violationsController.updateViolation(req, res, next);
      
      expect(next).toHaveBeenCalled();
      expect(next.mock.calls[0][0].statusCode).toBe(404);
    });
    
    it('should delete a violation', async () => {
      // Set params
      const violationId = new mongoose.Types.ObjectId();
      req.params.id = violationId;
      
      // Mock violation with remove method
      const mockViolation = {
        _id: violationId,
        remove: jest.fn().mockResolvedValue({})
      };
      
      // Mock Violation.findById
      Violation.findById = jest.fn().mockResolvedValue(mockViolation);
      
      await violationsController.deleteViolation(req, res, next);
      
      expect(Violation.findById).toHaveBeenCalledWith(violationId.toString());
      expect(mockViolation.remove).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json.mock.calls[0][0]).toEqual({
        success: true,
        data: {}
      });
    });
    
    it('should get violation statistics', async () => {
      // Mock aggregation results
      const mockTypeStats = [{ _id: 'AIRSTRIKE', count: 2 }];
      const mockLocationStats = [{ _id: 'Test Division', count: 3 }];
      const mockTimeStats = [{ _id: 2023, count: 5 }];
      const mockCasualties = [{ _id: null, total: 15 }];
      
      // Mock Violation.aggregate and countDocuments
      Violation.aggregate = jest.fn()
        .mockResolvedValueOnce(mockTypeStats)
        .mockResolvedValueOnce(mockLocationStats)
        .mockResolvedValueOnce(mockTimeStats)
        .mockResolvedValueOnce(mockCasualties);
      
      Violation.countDocuments = jest.fn().mockResolvedValue(10);
      
      await violationsController.getViolationStats(req, res, next);
      
      expect(Violation.aggregate).toHaveBeenCalledTimes(4);
      expect(Violation.countDocuments).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json.mock.calls[0][0]).toEqual({
        success: true,
        data: {
          totalViolations: 10,
          totalCasualties: 15,
          byType: mockTypeStats,
          byLocation: mockLocationStats,
          byYear: mockTimeStats
        }
      });
    });
  });
  
  describe('Auth Controller', () => {
    let req;
    let res;
    let next;
    
    beforeEach(() => {
      req = {
        body: {},
        cookies: {}
      };
      
      res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis(),
        cookie: jest.fn().mockReturnThis()
      };
      
      next = jest.fn();
      
      // Mock methods
      User.findOne = jest.fn();
      User.create = jest.fn();
      User.prototype.matchPassword = jest.fn();
    });
    
    it('should register a new user', async () => {
      // Set request body
      req.body = {
        name: 'Test User',
        email: 'register@test.com',
        password: 'password123',
        role: 'user'
      };
      
      // Mock User.create
      const mockUser = {
        _id: new mongoose.Types.ObjectId(),
        ...req.body,
        getSignedJwtToken: jest.fn().mockReturnValue('test-token')
      };
      
      User.create.mockResolvedValue(mockUser);
      
      await authController.register(req, res, next);
      
      expect(User.create).toHaveBeenCalledWith({
        name: req.body.name,
        email: req.body.email,
        password: req.body.password,
        role: 'user',
        organization: undefined
      });
      expect(mockUser.getSignedJwtToken).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.cookie).toHaveBeenCalled();
      expect(res.json.mock.calls[0][0]).toEqual({
        success: true,
        token: 'test-token'
      });
    });
    
    it('should login a user with valid credentials', async () => {
      // Set request body
      req.body = {
        email: 'login@test.com',
        password: 'password123'
      };
      
      // Mock user
      const mockUser = {
        _id: new mongoose.Types.ObjectId(),
        email: req.body.email,
        getSignedJwtToken: jest.fn().mockReturnValue('test-token'),
        matchPassword: jest.fn().mockResolvedValue(true)
      };
      
      // Mock User.findOne
      const selectMock = jest.fn().mockResolvedValue(mockUser);
      User.findOne.mockReturnValue({ select: selectMock });
      
      await authController.login(req, res, next);
      
      expect(User.findOne).toHaveBeenCalledWith({ email: req.body.email });
      expect(selectMock).toHaveBeenCalledWith('+password');
      expect(mockUser.matchPassword).toHaveBeenCalledWith(req.body.password);
      expect(mockUser.getSignedJwtToken).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json.mock.calls[0][0]).toEqual({
        success: true,
        token: 'test-token'
      });
    });
    
    it('should not login with invalid credentials', async () => {
      // Set request body
      req.body = {
        email: 'login@test.com',
        password: 'wrongpassword'
      };
      
      // Mock user
      const mockUser = {
        _id: new mongoose.Types.ObjectId(),
        email: req.body.email,
        matchPassword: jest.fn().mockResolvedValue(false)
      };
      
      // Mock User.findOne
      const selectMock = jest.fn().mockResolvedValue(mockUser);
      User.findOne.mockReturnValue({ select: selectMock });
      
      await authController.login(req, res, next);
      
      expect(selectMock).toHaveBeenCalledWith('+password');
      expect(mockUser.matchPassword).toHaveBeenCalledWith(req.body.password);
      expect(next).toHaveBeenCalled();
      expect(next.mock.calls[0][0].statusCode).toBe(401);
    });
    
    it('should get current user profile', async () => {
      // Mock user
      const userId = new mongoose.Types.ObjectId();
      const mockUser = {
        _id: userId,
        name: 'Test User',
        email: 'current@test.com',
        role: 'user'
      };
      
      // Set req.user
      req.user = { id: userId };
      
      // Mock User.findById
      User.findById = jest.fn().mockResolvedValue(mockUser);
      
      await authController.getMe(req, res, next);
      
      expect(User.findById).toHaveBeenCalledWith(userId);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json.mock.calls[0][0]).toEqual({
        success: true,
        data: mockUser
      });
    });
    
    it('should log out a user', async () => {
      await authController.logout(req, res, next);
      
      expect(res.cookie).toHaveBeenCalledWith('token', 'none', expect.any(Object));
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json.mock.calls[0][0]).toEqual({
        success: true,
        data: {}
      });
    });
  });
  
  describe('User Controller', () => {
    let req;
    let res;
    let next;
    
    beforeEach(() => {
      req = {
        params: {},
        body: {}
      };
      
      res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis(),
        cookie: jest.fn().mockReturnThis()
      };
      
      next = jest.fn();
      
      // Mock methods
      User.find = jest.fn();
      User.findById = jest.fn();
      User.create = jest.fn();
      User.findByIdAndUpdate = jest.fn();
      User.findByIdAndDelete = jest.fn();
    });
    
    it('should get all users', async () => {
      // Mock users
      const mockUsers = [
        { _id: new mongoose.Types.ObjectId(), name: 'User 1', email: 'user1@test.com' },
        { _id: new mongoose.Types.ObjectId(), name: 'User 2', email: 'user2@test.com' }
      ];
      
      // Mock User.find
      User.find.mockResolvedValue(mockUsers);
      
      await userController.getUsers(req, res, next);
      
      expect(User.find).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json.mock.calls[0][0]).toEqual({
        success: true,
        count: 2,
        data: mockUsers
      });
    });
    
    it('should get a single user', async () => {
      // Set params
      const userId = new mongoose.Types.ObjectId();
      req.params.id = userId;
      
      // Mock user
      const mockUser = {
        _id: userId,
        name: 'Test User',
        email: 'test@example.com',
        role: 'user'
      };
      
      // Mock User.findById
      User.findById.mockResolvedValue(mockUser);
      
      await userController.getUser(req, res, next);
      
      expect(User.findById).toHaveBeenCalledWith(userId.toString());
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json.mock.calls[0][0]).toEqual({
        success: true,
        data: mockUser
      });
    });
    
    it('should create a new user', async () => {
      // Set request body
      req.body = {
        name: 'New User',
        email: 'newuser@test.com',
        password: 'password123',
        role: 'editor'
      };
      
      // Mock created user
      const mockUser = {
        _id: new mongoose.Types.ObjectId(),
        ...req.body
      };
      
      // Mock User.create
      User.create.mockResolvedValue(mockUser);
      
      await userController.createUser(req, res, next);
      
      expect(User.create).toHaveBeenCalledWith(req.body);
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json.mock.calls[0][0]).toEqual({
        success: true,
        data: mockUser
      });
    });
    
    it('should update a user', async () => {
      // Set params and body
      const userId = new mongoose.Types.ObjectId();
      req.params.id = userId;
      req.body = {
        name: 'Updated Name',
        email: 'updated@test.com'
      };
      
      // Mock updated user
      const mockUser = {
        _id: userId,
        name: 'Updated Name',
        email: 'updated@test.com',
        role: 'user'
      };
      
      // Mock User.findByIdAndUpdate
      User.findByIdAndUpdate.mockResolvedValue(mockUser);
      
      await userController.updateUser(req, res, next);
      
      expect(User.findByIdAndUpdate).toHaveBeenCalledWith(
        userId.toString(),
        req.body,
        { new: true, runValidators: true }
      );
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json.mock.calls[0][0]).toEqual({
        success: true,
        data: mockUser
      });
    });
    
    it('should delete a user', async () => {
      // Set params
      const userId = new mongoose.Types.ObjectId();
      req.params.id = userId;
      
      // Mock User.findByIdAndDelete
      User.findByIdAndDelete.mockResolvedValue({});
      
      await userController.deleteUser(req, res, next);
      
      expect(User.findByIdAndDelete).toHaveBeenCalledWith(userId.toString());
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json.mock.calls[0][0]).toEqual({
        success: true,
        data: {}
      });
    });
  });
});