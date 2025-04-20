const config = require('../../config/config');

jest.mock('express-rate-limit', () => {
  const mockRateLimiter = jest.fn((req, res, next) => next());
  const mockConstructor = jest.fn(options => {
    mockConstructor.lastOptions = options;
    return mockRateLimiter;
  });
  return mockConstructor;
});

describe('Rate Limiter Middleware', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    require('../../middleware/rateLimiter');
  });

  it('should create rate limiter with correct configuration', () => {
    const rateLimiter = require('express-rate-limit');
    expect(rateLimiter).toHaveBeenCalledWith({
      windowMs: config.rateLimit.windowMs,
      max: config.rateLimit.max,
      standardHeaders: true,
      legacyHeaders: false,
      message: {
        success: false,
        error: 'Too many requests, please try again later.'
      },
      skip: expect.any(Function)
    });
  });

  it('should skip rate limiting for health check endpoint', () => {
    const rateLimiter = require('express-rate-limit');
    const mockReq = {
      path: '/api/health'
    };
    
    const skipFunction = rateLimiter.lastOptions.skip;
    const result = skipFunction(mockReq);
    
    expect(result).toBe(true);
  });

  it('should not skip rate limiting for other endpoints', () => {
    const rateLimiter = require('express-rate-limit');
    const mockReq = {
      path: '/api/violations'
    };
    
    const skipFunction = rateLimiter.lastOptions.skip;
    const result = skipFunction(mockReq);
    
    expect(result).toBe(false);
  });
}); 