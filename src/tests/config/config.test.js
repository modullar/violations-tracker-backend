const fs = require('fs');
const originalEnv = { ...process.env };

describe('Config Module', () => {
  let config;
  
  beforeEach(() => {
    // Reset modules to ensure clean tests
    jest.resetModules();
    
    // Clear cached config
    delete require.cache[require.resolve('../../config/config')];
    delete require.cache[require.resolve('../../config/logger')];
    delete require.cache[require.resolve('../../config/db')];
    
    // Reset env variables to original state
    process.env = { ...originalEnv };
  });
  
  afterAll(() => {
    // Restore original env
    process.env = originalEnv;
  });
  
  it('should load default values when environment variables are not set', () => {
    // Remove relevant env variables
    delete process.env.NODE_ENV;
    delete process.env.PORT;
    delete process.env.JWT_EXPIRES_IN;
    delete process.env.JWT_COOKIE_EXPIRE;
    delete process.env.RATE_LIMIT_WINDOW_MS;
    delete process.env.RATE_LIMIT_MAX;
    
    // Load config
    config = require('../../config/config');
    
    // Assert default values
    expect(config.env).toBe('development');
    expect(config.port).toBe(5001);
    expect(config.jwtExpiresIn).toBe('30d');
    expect(config.jwtCookieExpire).toBe(30);
    expect(config.rateLimit.windowMs).toBe(15 * 60 * 1000); // 15 minutes
    expect(config.rateLimit.max).toBe(500); // Development environment default
  });
  
  it('should use environment variables when set', () => {
    // Set test env variables
    process.env.NODE_ENV = 'test';
    process.env.PORT = '4000';
    process.env.JWT_EXPIRES_IN = '7d';
    process.env.JWT_COOKIE_EXPIRE = '7';
    process.env.RATE_LIMIT_WINDOW_MS = '600000'; // 10 minutes
    process.env.RATE_LIMIT_MAX = '50';
    
    // Load config
    config = require('../../config/config');
    
    // Assert values from env
    expect(config.env).toBe('test');
    expect(parseInt(config.port)).toBe(4000);
    expect(config.jwtExpiresIn).toBe('7d');
    expect(config.jwtCookieExpire).toBe(7);
    expect(config.rateLimit.windowMs).toBe(600000);
    expect(config.rateLimit.max).toBe(50);
  });
  
  it('should load environment-specific configuration when available', () => {
    // Mock fs.existsSync to simulate .env.test file exists
    jest.spyOn(fs, 'existsSync').mockImplementation((path) => {
      return path.includes('.env.test');
    });
    
    // Mock dotenv.config
    jest.mock('dotenv', () => ({
      config: jest.fn()
    }));
    
    // Set NODE_ENV
    process.env.NODE_ENV = 'test';
    
    // Load config
    config = require('../../config/config');
    
    // Check that the correct environment was loaded
    const dotenv = require('dotenv');
    expect(dotenv.config).toHaveBeenCalledWith({
      path: expect.stringContaining('.env.test')
    });
  });
  
  it('should use production defaults when NODE_ENV is production', () => {
    // Set NODE_ENV to production but remove other variables
    process.env.NODE_ENV = 'production';
    delete process.env.RATE_LIMIT_MAX;
    
    // Load config
    config = require('../../config/config');
    
    // Assert production default for rate limit max
    expect(config.rateLimit.max).toBe(100);
  });
});