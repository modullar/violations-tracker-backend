const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const auth = require('../../middleware/auth');
const { protect, authorize } = auth;
const User = require('../../models/User');
const ErrorResponse = require('../../utils/errorResponse');

// Mock dependencies
jest.mock('jsonwebtoken');
jest.mock('../../models/User');

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
    // Clear all mocks before each test
    jest.clearAllMocks();
  });
  
  it('should return 401 if no token is provided', async () => {
    await protect(req, res, next);
    
    expect(next).toHaveBeenCalledWith(expect.any(ErrorResponse));
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 401,
        message: 'Not authorized to access this route'
      })
    );
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
    
    // Mock JWT verify with proper payload
    jwt.verify = jest.fn().mockReturnValue({ id: userId.toString() });
    
    // Set token in headers with Bearer scheme
    req.headers.authorization = 'Bearer test-token';
    
    await protect(req, res, next);
    
    expect(jwt.verify).toHaveBeenCalledWith('test-token', process.env.JWT_SECRET);
    expect(User.findById).toHaveBeenCalledWith(userId.toString());
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
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 401,
        message: 'Not authorized to access this route'
      })
    );
  });
  
  it('should return 404 if user no longer exists', async () => {
    const userId = new mongoose.Types.ObjectId();
    // Mock User.findById to return null
    User.findById = jest.fn().mockResolvedValue(null);
    
    // Mock JWT verify with proper payload
    jwt.verify = jest.fn().mockReturnValue({ id: userId.toString() });
    
    // Set token in headers
    req.headers.authorization = 'Bearer test-token';
    
    await protect(req, res, next);
    
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 404,
        message: 'User not found'
      })
    );
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
    expect(next).toHaveBeenCalledWith();
  });
  
  it('should return 403 if user does not have required role', () => {
    const authMiddleware = authorize('admin', 'editor');
    authMiddleware(req, res, next);
    
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 403,
        message: expect.stringContaining('is not authorized')
      })
    );
    expect(next.mock.calls[0][0].message).toContain('User role user is not authorized');
  });
}); 