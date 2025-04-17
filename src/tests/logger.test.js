const winston = require('winston');
const logger = require('../utils/logger');

jest.mock('winston', () => {
  const mockLogger = {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn()
  };
  return {
    createLogger: jest.fn().mockReturnValue(mockLogger),
    format: {
      combine: jest.fn(),
      timestamp: jest.fn(),
      printf: jest.fn()
    },
    transports: {
      Console: jest.fn(),
      File: jest.fn()
    }
  };
});

describe('Logger', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should log info message', () => {
    const message = 'Test info message';
    logger.info(message);
    expect(winston.createLogger().info).toHaveBeenCalledWith(message);
  });

  it('should log error message', () => {
    const message = 'Test error message';
    logger.error(message);
    expect(winston.createLogger().error).toHaveBeenCalledWith(message);
  });

  it('should log warning message', () => {
    const message = 'Test warning message';
    logger.warn(message);
    expect(winston.createLogger().warn).toHaveBeenCalledWith(message);
  });

  it('should log debug message', () => {
    const message = 'Test debug message';
    logger.debug(message);
    expect(winston.createLogger().debug).toHaveBeenCalledWith(message);
  });
});