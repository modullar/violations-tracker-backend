const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const logger = require('../config/logger');

// Mock dependencies
jest.mock('../config/logger', () => ({
  info: jest.fn(),
  error: jest.fn()
}));

jest.mock('mongoose', () => {
  const originalMongoose = jest.requireActual('mongoose');
  return {
    ...originalMongoose,
    connect: jest.fn()
  };
});

describe('Database Connection', () => {
  let connectDB;
  
  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Reset the module cache
    jest.resetModules();
    process.exit = jest.fn(); // Mock process.exit
    
    // Import the module to test
    connectDB = require('../config/db');
  });
  
  afterAll(async () => {
    // Clean up connections
    await mongoose.disconnect();
  });
  
  it('should connect to the database successfully', async () => {
    // Mock successful connection
    mongoose.connect.mockResolvedValueOnce({
      connection: {
        host: 'localhost'
      }
    });
    
    // Set config variable
    process.env.MONGO_URI = 'mongodb://localhost:27017/test-db';
    
    // Call function
    await connectDB();
    
    // Verify mongoose.connect was called with the right URI
    expect(mongoose.connect).toHaveBeenCalledWith('mongodb://localhost:27017/test-db');
    
    // Verify logger.info was called
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('MongoDB Connected'));
    
    // Verify process.exit was not called
    expect(process.exit).not.toHaveBeenCalled();
  });
  
  it('should exit if mongo URI is not defined', async () => {
    // Remove MONGO_URI
    delete process.env.MONGO_URI;
    
    // Call function
    await connectDB();
    
    // Should log error
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('MongoDB URI is not defined'));
    
    // Should exit with code 1
    expect(process.exit).toHaveBeenCalledWith(1);
    
    // Should not attempt to connect
    expect(mongoose.connect).not.toHaveBeenCalled();
  });
  
  it('should handle connection errors', async () => {
    // Mock connection error
    const errorMessage = 'Connection failed';
    mongoose.connect.mockRejectedValueOnce(new Error(errorMessage));
    
    // Set config variable
    process.env.MONGO_URI = 'mongodb://localhost:27017/test-db';
    
    // Call function
    await connectDB();
    
    // Should log error
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining(errorMessage));
    
    // Should exit with code 1
    expect(process.exit).toHaveBeenCalledWith(1);
  });
});