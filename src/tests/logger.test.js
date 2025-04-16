const winston = require('winston');

// Mock winston
jest.mock('winston', () => {
  const mockFormat = {
    combine: jest.fn().mockReturnThis(),
    timestamp: jest.fn().mockReturnThis(),
    printf: jest.fn().mockReturnThis(),
    colorize: jest.fn().mockReturnThis()
  };
  
  const mockTransports = {
    Console: jest.fn(),
    File: jest.fn()
  };
  
  return {
    format: mockFormat,
    createLogger: jest.fn().mockReturnValue({
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn()
    }),
    transports: mockTransports
  };
});

describe('Logger Module', () => {
  let originalNodeEnv = process.env.NODE_ENV;
  
  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Reset module cache
    jest.resetModules();
  });
  
  afterEach(() => {
    // Restore NODE_ENV
    process.env.NODE_ENV = originalNodeEnv;
  });
  
  it('should create a logger with console transport in development mode', () => {
    // Set development environment
    process.env.NODE_ENV = 'development';
    
    // Load logger module
    require('../config/logger');
    
    // Check that Console transport was created
    expect(winston.transports.Console).toHaveBeenCalled();
    expect(winston.createLogger).toHaveBeenCalled();
  });
  
  it('should create a logger with file transport in production mode', () => {
    // Set production environment
    process.env.NODE_ENV = 'production';
    
    // Load logger module
    require('../config/logger');
    
    // Check that File transport was created
    expect(winston.transports.File).toHaveBeenCalled();
    expect(winston.createLogger).toHaveBeenCalled();
  });
  
  it('should expose logger methods', () => {
    // Load logger module
    const logger = require('../config/logger');
    
    // Check that logger methods are defined
    expect(logger.info).toBeDefined();
    expect(logger.error).toBeDefined();
    expect(logger.warn).toBeDefined();
  });
});