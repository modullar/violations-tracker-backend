const mongoose = require('mongoose');
// Only import MongoMemoryServer when needed for integration tests
let MongoMemoryServer;

// Mock for the geocoder in test environment
jest.mock('node-geocoder', () => {
  return () => {
    return {
      geocode: jest.fn(async (query) => {
        // If it's the invalid location test, return empty result
        if (query && query.includes('xyznon-existentlocation12345completelyfake')) {
          return [];
        }
        
        // For Bustan al-Qasr
        if (query && query.includes('Bustan al-Qasr')) {
          return [{
            latitude: 36.186764,
            longitude: 37.1441285,
            country: 'Syria',
            city: 'Aleppo',
            state: 'Aleppo Governorate',
            formattedAddress: 'Bustan al-Qasr, Aleppo, Syria'
          }];
        }
        
        // For Aleppo
        if (query && query.includes('Aleppo') && !query.includes('Bustan')) {
          return [{
            latitude: 36.2021047,
            longitude: 37.1342603,
            country: 'Syria',
            city: 'Aleppo',
            state: 'Aleppo Governorate',
            formattedAddress: 'Aleppo, Syria'
          }];
        }
        
        // For Al-Midan
        if (query && query.includes('Al-Midan')) {
          return [{
            latitude: 33.4913481,
            longitude: 36.2983286,
            country: 'Syria',
            city: 'Damascus',
            state: 'Damascus Governorate',
            formattedAddress: 'Al-Midan, Damascus, Syria'
          }];
        }
        
        // For Jobar
        if (query && query.includes('Jobar')) {
          return [{
            latitude: 33.5192467,
            longitude: 36.330847,
            country: 'Syria',
            city: 'Damascus',
            state: 'Damascus Governorate',
            formattedAddress: 'Jobar, Damascus, Syria'
          }];
        }
        
        // For Muadamiyat al-Sham
        if (query && query.includes('Muadamiyat al-Sham')) {
          return [{
            latitude: 33.4613288,
            longitude: 36.1925483,
            country: 'Syria',
            city: 'Muadamiyat al-Sham',
            state: 'Rif Dimashq Governorate',
            formattedAddress: 'Muadamiyat al-Sham, Rif Dimashq, Syria'
          }];
        }
        
        // For Al-Waer
        if (query && query.includes('Al-Waer')) {
          return [{
            latitude: 34.7397406,
            longitude: 36.6652056,
            country: 'Syria',
            city: 'Homs',
            state: 'Homs Governorate',
            formattedAddress: 'Al-Waer, Homs, Syria'
          }];
        }
        
        // Default mock response
        return [{
          latitude: 35.0,
          longitude: 38.0,
          country: 'Syria',
          city: 'Unknown',
          state: '',
          formattedAddress: 'Syria'
        }];
      })
    };
  };
});

// Mock Bull queue for tests
jest.mock('bull', () => {
  return jest.fn().mockImplementation(() => ({
    add: jest.fn().mockResolvedValue({ id: 'mock-job-id' }),
    process: jest.fn(),
    on: jest.fn(),
    close: jest.fn().mockResolvedValue(),
    removeRepeatable: jest.fn().mockResolvedValue()
  }));
});

// Mock Bull Board to prevent issues in tests
jest.mock('@bull-board/api', () => ({
  createBullBoard: jest.fn().mockReturnValue({}),
  BullAdapter: jest.fn().mockImplementation(() => ({}))
}));

jest.mock('@bull-board/express', () => ({
  ExpressAdapter: jest.fn().mockImplementation(() => ({
    setBasePath: jest.fn(),
    getRouter: jest.fn().mockReturnValue((req, res, next) => next())
  }))
}));

let mongoServer;

// Database connection functions for tests
const connectDB = async () => {
  try {
    // Only import MongoMemoryServer when actually needed
    if (!MongoMemoryServer) {
      const { MongoMemoryServer: MMS } = require('mongodb-memory-server');
      MongoMemoryServer = MMS;
    }
    
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(mongoUri);
    }
  } catch (error) {
    console.error('Error connecting to test database:', error);
    throw error;
  }
};

const closeDB = async () => {
  try {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.close();
    }
    if (mongoServer) {
      await mongoServer.stop();
    }
  } catch (error) {
    console.error('Error closing test database:', error);
    throw error;
  }
};

// Set up MongoDB in-memory server for testing
// We conditionally connect here only for integration tests that need a real DB
beforeAll(async () => {
  if (process.env.REAL_DB_TEST) {
    await connectDB();
  }
});

// Clean up after tests
afterAll(async () => {
  if (process.env.REAL_DB_TEST) {
    await closeDB();
  }
});

// Clear all test data between each test
afterEach(async () => {
  if (process.env.REAL_DB_TEST && mongoose.connection.readyState !== 0) {
    const collections = mongoose.connection.collections;
    
    for (const key in collections) {
      const collection = collections[key];
      await collection.deleteMany();
    }
  }
});

module.exports = {
  connectDB,
  closeDB
};