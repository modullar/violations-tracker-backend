const asyncHandler = require('../utils/asyncHandler');
const ErrorResponse = require('../utils/errorResponse');
const geocoder = require('../utils/geocoder');

describe('Utility Functions', () => {
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
  
  describe('Geocoder', () => {
    // Mock the node-geocoder library
    beforeEach(() => {
      jest.mock('node-geocoder', () => {
        return () => ({
          geocode: jest.fn().mockImplementation((query) => {
            if (query === 'Valid Location') {
              return Promise.resolve([{
                latitude: 34.5,
                longitude: 35.5,
                formattedAddress: 'Valid Location, Country',
                city: 'Valid Location',
                country: 'Country'
              }]);
            } else {
              return Promise.resolve([]);
            }
          })
        });
      });
      
      // Reset module cache
      jest.resetModules();
    });
    
    it('should geocode a valid location', async () => {
      // Get fresh instance after mock
      const geocoder = require('../utils/geocoder');
      
      // Test geocodeLocation function
      const result = await geocoder.geocodeLocation('Valid Location');
      
      expect(result).toBeDefined();
      expect(result).toHaveLength(1);
      expect(result[0]).toHaveProperty('latitude', 34.5);
      expect(result[0]).toHaveProperty('longitude', 35.5);
    });
    
    it('should return empty array for invalid location', async () => {
      // Get fresh instance after mock
      const geocoder = require('../utils/geocoder');
      
      // Test geocodeLocation function
      const result = await geocoder.geocodeLocation('Invalid Location');
      
      expect(result).toEqual([]);
    });
  });
});