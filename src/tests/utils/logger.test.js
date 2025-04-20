// Create a mock logger for testing
const mockLogger = {
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
  add: jest.fn()
};

// Mock winston before requiring the logger
jest.mock('winston', () => {
  return {
    createLogger: jest.fn().mockReturnValue(mockLogger),
    format: {
      combine: jest.fn().mockReturnValue({}),
      timestamp: jest.fn().mockReturnValue({}),
      printf: jest.fn().mockReturnValue({}),
      errors: jest.fn().mockReturnValue({}),
      splat: jest.fn().mockReturnValue({}),
      json: jest.fn().mockReturnValue({}),
      colorize: jest.fn().mockReturnValue({}),
      simple: jest.fn().mockReturnValue({})
    },
    transports: {
      Console: jest.fn(),
      File: jest.fn()
    }
  };
});

// Import logger after mocking winston
const logger = require('../../config/logger');

describe('Logger', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should log info message', () => {
    const message = 'Test info message';
    logger.info(message);
    expect(mockLogger.info).toHaveBeenCalledWith(message);
  });

  it('should log error message', () => {
    const message = 'Test error message';
    logger.error(message);
    expect(mockLogger.error).toHaveBeenCalledWith(message);
  });

  it('should log warning message', () => {
    const message = 'Test warning message';
    logger.warn(message);
    expect(mockLogger.warn).toHaveBeenCalledWith(message);
  });

  it('should log debug message', () => {
    const message = 'Test debug message';
    logger.debug(message);
    expect(mockLogger.debug).toHaveBeenCalledWith(message);
  });
});