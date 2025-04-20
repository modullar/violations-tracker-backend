const mongoose = require('mongoose');
const connectDB = require('../../config/db');
const logger = require('../../config/logger');
const config = require('../../config/config');

// Mock modules
jest.mock('mongoose');
jest.mock('../../config/logger');
jest.mock('../../config/config');

describe('Database Connection', () => {
  let mockMongoUri;
  
  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks();
    
    // Mock process.exit
    process.exit = jest.fn();
    
    // Mock mongoose.connect
    mongoose.connect = jest.fn().mockResolvedValue({
      connection: {
        host: 'localhost'
      }
    });
    
    // Mock config
    mockMongoUri = 'mongodb://localhost:27017/test-db';
    config.mongoUri = mockMongoUri;
    config.env = 'test';
  });
  
  it('should connect to the database successfully', async () => {
    // Call the function
    await connectDB();
    
    // Verify mongoose.connect was called with correct URI
    expect(mongoose.connect).toHaveBeenCalledWith(mockMongoUri);
    
    // Verify logger was called
    expect(logger.info).toHaveBeenCalledWith('MongoDB Connected: localhost (test environment)');
  });
  
  it('should log error and exit if mongo URI is not defined', async () => {
    // Set mongoUri to undefined
    config.mongoUri = undefined;
    
    // Call the function
    await connectDB();
    
    // Verify error was logged
    expect(logger.error).toHaveBeenCalledWith('MongoDB URI is not defined in the environment variables');
    
    // Verify process.exit was called
    expect(process.exit).toHaveBeenCalledWith(1);
  });
  
  it('should handle connection errors', async () => {
    const errorMessage = 'Connection failed';
    
    // Mock mongoose.connect to reject
    mongoose.connect.mockRejectedValue(new Error(errorMessage));
    
    // Call the function
    await connectDB();
    
    // Verify error was logged
    expect(logger.error).toHaveBeenCalledWith('Error connecting to MongoDB: Connection failed');
    
    // Verify process.exit was called
    expect(process.exit).toHaveBeenCalledWith(1);
  });
});