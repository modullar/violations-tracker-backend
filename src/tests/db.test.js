const mongoose = require('mongoose');

// Mock the config values to be used in tests
const mockMongoUri = 'mongodb://localhost:27017/test-db';

// Mock dependencies with simple implementations
jest.mock('mongoose', () => ({
  connect: jest.fn()
}));

jest.mock('../config/logger', () => ({
  info: jest.fn(),
  error: jest.fn()
}));

// Mock different config scenarios for different tests
const mockConfigWithUri = {
  mongoUri: mockMongoUri,
  env: 'test'
};

// Create simple tests
describe('Database Connection', () => {
  let logger;
  
  // Setup for all tests
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock process.exit to avoid actual process termination
    process.exit = jest.fn();
    
    // Get logger instance
    logger = require('../config/logger');
  });
  
  // Test successful case
  it('should connect to the database successfully', async () => {
    // Mock config with URI
    jest.mock('../config/config', () => mockConfigWithUri);
    
    // Mock successful connection
    mongoose.connect.mockResolvedValueOnce({
      connection: { host: 'localhost' }
    });
    
    // Import the module to test after mocking
    const connectDB = require('../config/db');
    
    // Execute the function
    await connectDB();
    
    // Verify correct behavior
    expect(mongoose.connect).toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalled();
    expect(process.exit).not.toHaveBeenCalled();
  });
  
  // Test missing URI
  it('should log error and exit if mongo URI is not defined', () => {
    // Use destructive test pattern where we modify config directly
    // This helps avoid module caching issues
    const config = require('../config/config');
    
    // Backup original value
    const originalUri = config.mongoUri;
    
    // Modify for this test only
    config.mongoUri = undefined;
    
    // Import the module after modifying config
    const connectDB = require('../config/db');
    
    // Execute the function (don't await because it should exit early)
    connectDB();
    
    // Verify correct behavior
    expect(logger.error).toHaveBeenCalledWith(
      'MongoDB URI is not defined in the environment variables'
    );
    expect(process.exit).toHaveBeenCalledWith(1);
    
    // Restore original value for other tests
    config.mongoUri = originalUri;
  });
  
  // Test connection error
  it('should handle connection errors', async () => {
    // Mock config with URI
    jest.mock('../config/config', () => mockConfigWithUri);
    
    // Mock connection error
    const errorMessage = 'Connection failed';
    mongoose.connect.mockRejectedValueOnce(new Error(errorMessage));
    
    // Import the module after mocking
    const connectDB = require('../config/db');
    
    // Execute the function
    await connectDB();
    
    // Verify correct behavior
    expect(logger.error).toHaveBeenCalled();
    expect(process.exit).toHaveBeenCalledWith(1);
  });
});