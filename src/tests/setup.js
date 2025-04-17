const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

let mongoServer;

// Set up MongoDB in-memory server for testing
// We conditionally connect here only for integration tests that need a real DB
beforeAll(async () => {
  if (process.env.REAL_DB_TEST) {
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    
    // Only connect if not already connected (for unit tests that mock connections)
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(mongoUri);
    }
  }
});

// Clean up after tests
afterAll(async () => {
  if (process.env.REAL_DB_TEST) {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.close();
    }
    if (mongoServer) {
      await mongoServer.stop();
    }
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