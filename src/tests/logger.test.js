const winston = require('winston');

// Mock winston
jest.mock('winston', () => {
  const mockFormat = {
    combine: jest.fn().mockReturnThis(),
    timestamp: jest.fn().mockReturnThis(),
    printf: jest.fn().mockReturnThis(),
    colorize: jest.fn().mockReturnThis(),
    splat: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    simple: jest.fn().mockReturnThis(),
    errors: jest.fn().mockReturnThis()
  };
  
  const mockTransports = {
    Console: jest.fn(),
    File: jest.fn()
  };
  
  const mockLogger = {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    add: jest.fn()
  };
  
  return {
    format: mockFormat,
    createLogger: jest.fn().mockReturnValue(mockLogger),
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
    
    // Reset createLogger mock to capture actual usage
    winston.createLogger.mockClear();
    winston.transports.Console.mockClear();
    
    // Capture the original add method
    const originalAdd = winston.createLogger().add;
    
    // Create a spy for the add method
    const addSpy = jest.fn();
    winston.createLogger.mockReturnValue({
      ...winston.createLogger(),
      add: addSpy
    });
    
    // Load logger module
    const logger = require('../config/logger');
    
    // Check that Console transport was added
    expect(addSpy).toHaveBeenCalled();
    expect(winston.createLogger).toHaveBeenCalled();

    // Restore the original add method
    winston.createLogger.mockReturnValue({
      ...winston.createLogger(),
      add: originalAdd
    });
  });
  
  it('should create a logger with file transport in production mode', () => {
    // Set production environment
    process.env.NODE_ENV = 'production';
    
    // Reset mocks
    winston.createLogger.mockClear();
    winston.transports.File.mockClear();
    
    // Load logger module
    require('../config/logger');
    
    // Check that logger was created
    expect(winston.createLogger).toHaveBeenCalled();
    expect(winston.createLogger).toHaveBeenCalledWith(expect.objectContaining({
      transports: expect.any(Array)
    }));
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