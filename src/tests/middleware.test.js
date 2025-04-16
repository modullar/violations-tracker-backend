const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const errorHandler = require('../middleware/error');
const auth = require('../middleware/auth');
const { protect, authorize } = auth;
const User = require('../models/User');

// Mock dependencies
jest.mock('jsonwebtoken');
jest.mock('../config/logger', () => ({
  error: jest.fn()
}));

describe('Middleware Tests', () => {
  describe('Error Middleware', () => {
    let res;
    let next;
    
    beforeEach(() => {
      res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };
      next = jest.fn();
    });
    
    it('should handle validation errors', () => {
      const err = {
        name: 'ValidationError',
        errors: {
          name: { message: 'Name is required' },
          email: { message: 'Email is required' }
        }
      };
      
      errorHandler(err, {}, res, next);
      
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: expect.stringContaining('validation failed')
      });
    });
    
    it('should handle duplicate key errors', () => {
      const err = {
        code: 11000,
        keyValue: { email: 'test@example.com' }
      };
      
      errorHandler(err, {}, res, next);
      
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: expect.stringContaining('duplicate')
      });
    });
    
    it('should handle cast errors', () => {
      const err = {
        name: 'CastError',
        path: 'id',
        value: 'invalid-id'
      };
      
      errorHandler(err, {}, res, next);
      
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: expect.stringContaining('Resource not found')
      });
    });
    
    it('should handle default errors', () => {
      const err = {
        message: 'Server error',
        statusCode: 500
      };
      
      errorHandler(err, {}, res, next);
      
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Server error'
      });
    });
  });
  
  describe('Authentication Middleware', () => {
    let req;
    let res;
    let next;
    
    beforeEach(() => {
      req = {
        headers: {},
        cookies: {}
      };
      res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };
      next = jest.fn();
    });
    
    it('should return 401 if no token is provided', async () => {
      await protect(req, res, next);
      
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: expect.stringContaining('Not authorized')
      });
    });
    
    it('should verify token and set req.user', async () => {
      // Mock data
      const userId = new mongoose.Types.ObjectId();
      const user = {
        _id: userId,
        name: 'Test User',
        email: 'test@example.com',
        role: 'user'
      };
      
      // Mock User.findById
      User.findById = jest.fn().mockResolvedValue(user);
      
      // Mock JWT verify
      jwt.verify = jest.fn().mockReturnValue({ id: userId });
      
      // Set token in headers
      req.headers.authorization = 'Bearer test-token';
      
      await protect(req, res, next);
      
      expect(jwt.verify).toHaveBeenCalled();
      expect(User.findById).toHaveBeenCalledWith(userId);
      expect(req.user).toEqual(user);
      expect(next).toHaveBeenCalled();
    });
    
    it('should return 401 if token is invalid', async () => {
      // Mock JWT verify to throw error
      jwt.verify = jest.fn().mockImplementation(() => {
        throw new Error('Invalid token');
      });
      
      // Set token in headers
      req.headers.authorization = 'Bearer invalid-token';
      
      await protect(req, res, next);
      
      expect(jwt.verify).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: expect.stringContaining('Not authorized')
      });
    });
    
    it('should return 401 if user no longer exists', async () => {
      // Mock User.findById to return null
      User.findById = jest.fn().mockResolvedValue(null);
      
      // Mock JWT verify
      jwt.verify = jest.fn().mockReturnValue({ id: 'some-id' });
      
      // Set token in headers
      req.headers.authorization = 'Bearer test-token';
      
      await protect(req, res, next);
      
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: expect.stringContaining('does not exist')
      });
    });
  });
  
  describe('Authorization Middleware', () => {
    let req;
    let res;
    let next;
    
    beforeEach(() => {
      req = {
        user: {
          role: 'user'
        }
      };
      res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };
      next = jest.fn();
    });
    
    it('should call next if user has required role', () => {
      const authMiddleware = authorize('user', 'admin');
      authMiddleware(req, res, next);
      
      expect(next).toHaveBeenCalled();
    });
    
    it('should return 403 if user does not have required role', () => {
      const authMiddleware = authorize('admin', 'editor');
      authMiddleware(req, res, next);
      
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: expect.stringContaining('not authorized')
      });
      expect(next).not.toHaveBeenCalled();
    });
  });
});