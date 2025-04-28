const errorHandler = require('../../middleware/error');

// Mock the logger
jest.mock('../../config/logger', () => ({
  error: jest.fn()
}));

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
      error: 'Name is required, Email is required',
      data: null
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
      error: 'Duplicate field value entered',
      data: null
    });
  });
  
  it('should handle cast errors', () => {
    const err = {
      name: 'CastError',
      path: 'id',
      value: 'invalid-id'
    };
    
    errorHandler(err, {}, res, next);
    
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Resource not found',
      data: null
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
      error: 'Server error',
      data: null
    });
  });
}); 