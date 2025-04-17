const mongoose = require('mongoose');
const logger = require('../config/logger');
const config = require('../config/config');

// Mock dependencies
jest.mock('../config/logger', () => ({
  info: jest.fn(),
  error: jest.fn()
}));

jest.mock('../config/config', () => ({
  mongoUri: process.env.MONGO_URI,
  env: 'test'
}));

describe('Database Connection', () => {
  let connectDB;
  let mockConnect;
  
  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();
    jest.resetModules();
    
    // Mock process.exit
    process.exit = jest.fn();
    
    // Create a new mock implementation for mongoose.connect
    mockConnect = jest.fn();
    mongoose.connect = mockConnect;
    
    // Import the module to test
    connectDB = require('../config/db');
  });
  
  afterAll(async () => {
    await mongoose.disconnect();
  });
  
  it('should connect to the database successfully', async () => {
    // Mock successful connection
    const mockConnection = {
      connection: {
        host: 'localhost'
      }
    };
    mockConnect.mockResolvedValue(mockConnection);
    
    // Set config variable
    process.env.MONGO_URI = 'mongodb://localhost:27017/test-db';
    
    // Call function
    await connectDB();
    
    // Verify mongoose.connect was called with the right URI
    expect(mockConnect).toHaveBeenCalledWith('mongodb://localhost:27017/test-db');
    
    // Verify logger.info was called
    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining('MongoDB Connected: localhost')
    );
    
    // Verify process.exit was not called
    expect(process.exit).not.toHaveBeenCalled();
  });
  
  it('should exit if mongo URI is not defined', async () => {
    // Remove MONGO_URI from config
    jest.mock('../config/config', () => ({
      mongoUri: undefined,
      env: 'test'
    }));
    
    // Reload the module to use new config
    connectDB = require('../config/db');
    
    // Call function
    await connectDB();
    
    // Should log error
    expect(logger.error).toHaveBeenCalledWith(
      'MongoDB URI is not defined in the environment variables'
    );
    
    // Should exit with code 1
    expect(process.exit).toHaveBeenCalledWith(1);
    
    // Should not attempt to connect
    expect(mockConnect).not.toHaveBeenCalled();
  });
  
  it('should handle connection errors', async () => {
    // Mock connection error
    const errorMessage = 'Connection failed';
    mockConnect.mockRejectedValue(new Error(errorMessage));
    
    // Set config variable
    process.env.MONGO_URI = 'mongodb://localhost:27017/test-db';
    
    // Call function
    await connectDB();
    
    // Should log error
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining(errorMessage)
    );
    
    // Should exit with code 1
    expect(process.exit).toHaveBeenCalledWith(1);
  });
});