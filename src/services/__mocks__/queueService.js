// Manual mock for queueService - prevents Redis connections during tests

const mockQueue = {
  add: jest.fn(),
  process: jest.fn(),
  on: jest.fn(),
  close: jest.fn()
};

const addJob = jest.fn().mockResolvedValue(undefined);

const cleanup = jest.fn().mockResolvedValue(undefined);

module.exports = {
  addJob,
  reportParsingQueue: mockQueue,
  cleanup
}; 