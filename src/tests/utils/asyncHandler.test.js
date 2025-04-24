const asyncHandler = require('../../utils/asyncHandler');

describe('asyncHandler', () => {
  it('should handle resolved promises', async () => {
    // Mock Express middleware
    const mockReq = {};
    const mockRes = {};
    const mockNext = jest.fn();
    
    // Create handler that resolves
    const expectedResult = { success: true };
    const handler = jest.fn().mockResolvedValue(expectedResult);
    const wrappedHandler = asyncHandler(handler);
    
    // Call the wrapped handler
    await wrappedHandler(mockReq, mockRes, mockNext);
    
    // Assert handler was called with the right arguments
    expect(handler).toHaveBeenCalledWith(mockReq, mockRes, mockNext);
    
    // Next should not be called with error
    expect(mockNext).not.toHaveBeenCalled();
  });
  
  it('should handle rejected promises', async () => {
    // Mock Express middleware
    const mockReq = {};
    const mockRes = {};
    const mockNext = jest.fn();
    
    // Create handler that rejects
    const errorMessage = 'Test error';
    const handler = jest.fn().mockRejectedValue(new Error(errorMessage));
    const wrappedHandler = asyncHandler(handler);
    
    // Call the wrapped handler
    await wrappedHandler(mockReq, mockRes, mockNext);
    
    // Next should be called with the error
    expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
    expect(mockNext.mock.calls[0][0].message).toBe(errorMessage);
  });
}); 