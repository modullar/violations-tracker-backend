// Test for logger middleware
const mockMorgan = jest.fn();
const mockInfoLogger = jest.fn();

// Set up mocks before requiring the modules
jest.mock('morgan', () => mockMorgan);
jest.mock('../../config/logger', () => ({
  info: mockInfoLogger
}));

describe('Logger Middleware', () => {
  let middleware;
  let streamWriteFunction;
  let formatString;
  let streamObject;
  
  beforeEach(() => {
    // Clear previous mock data
    jest.clearAllMocks();
    
    // Reset all cached modules
    jest.resetModules();
    
    // Re-mock with implementation that captures parameters
    mockMorgan.mockImplementation((format, options) => {
      formatString = format;
      streamObject = options.stream;
      return 'middleware-function';
    });
    
    // Import the middleware to trigger the morgan configuration
    middleware = require('../../middleware/logger');
    
    // Capture the write function
    streamWriteFunction = streamObject.write;
  });
  
  describe('Morgan Configuration', () => {
    it('should configure morgan with correct format string', () => {
      const expectedFormat = ':remote-addr - :remote-user [:date[clf]] ":method :url HTTP/:http-version" :status :res[content-length] ":referrer" ":user-agent" - :response-time ms';
      expect(formatString).toBe(expectedFormat);
    });
    
    it('should configure morgan with a stream object', () => {
      expect(streamObject).toBeDefined();
      expect(typeof streamObject.write).toBe('function');
    });
    
    it('should return the middleware function', () => {
      expect(middleware).toBe('middleware-function');
    });
  });
  
  describe('Stream Function', () => {
    it('should trim and log messages using logger.info', () => {
      const testCases = [
        { input: 'Test message\n', expected: 'Test message' },
        { input: '  Padded message  \n', expected: 'Padded message' },
        { input: 'No newline', expected: 'No newline' }
      ];
      
      testCases.forEach(({ input, expected }) => {
        streamWriteFunction(input);
        expect(mockInfoLogger).toHaveBeenCalledWith(expected);
        mockInfoLogger.mockClear();
      });
    });
    
    it('should handle empty or whitespace-only messages', () => {
      const emptyInputs = ['\n', '  \n  ', '', '   '];
      
      emptyInputs.forEach(input => {
        streamWriteFunction(input);
        expect(mockInfoLogger).toHaveBeenCalledWith(input.trim());
        mockInfoLogger.mockClear();
      });
    });
    
    it('should handle HTTP access logs', () => {
      const accessLog = '::1 - - [21/Apr/2024:10:52:00 +0000] "GET /api/health HTTP/1.1" 200 150 "-" "curl/7.64.1" - 5.123 ms\n';
      streamWriteFunction(accessLog);
      expect(mockInfoLogger).toHaveBeenCalledWith(accessLog.trim());
    });
    
    it('should handle null or undefined safely', () => {
      // For null or undefined, we expect empty string to be logged
      [null, undefined].forEach(input => {
        streamWriteFunction(input);
        expect(mockInfoLogger).toHaveBeenCalledWith('');
        mockInfoLogger.mockClear();
      });
    });
  });
});

