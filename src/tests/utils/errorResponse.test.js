const ErrorResponse = require('../../utils/errorResponse');

describe('ErrorResponse', () => {
  it('should create an error with message and statusCode', () => {
    const message = 'Resource not found';
    const statusCode = 404;
    
    const error = new ErrorResponse(message, statusCode);
    
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe(message);
    expect(error.statusCode).toBe(statusCode);
  });
  
  it('should have default stack trace', () => {
    const error = new ErrorResponse('Test', 400);
    
    expect(error.stack).toBeDefined();
  });
}); 