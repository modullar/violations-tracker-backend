const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

let mongoServer;

// Set up MongoDB in-memory server for testing
beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const mongoUri = mongoServer.getUri();

  await mongoose.connect(mongoUri);
});

// Clean up after tests
afterAll(async () => {
  await mongoose.connection.close();
  await mongoServer.stop();
});

// Clear all test data between each test
afterEach(async () => {
  const collections = mongoose.connection.collections;

  for (const key in collections) {
    const collection = collections[key];
    await collection.deleteMany();
  }
});