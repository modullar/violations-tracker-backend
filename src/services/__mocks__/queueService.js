// Manual mock for queueService - prevents Redis connections during tests

const mockQueue = {
  add: jest.fn().mockResolvedValue({ id: 'mock-job-id' }),
  process: jest.fn(),
  on: jest.fn(),
  close: jest.fn().mockResolvedValue(),
  removeRepeatable: jest.fn().mockResolvedValue()
};

const addJob = jest.fn().mockResolvedValue(undefined);

const cleanup = jest.fn().mockResolvedValue(undefined);

// New methods for Telegram scraping
const triggerTelegramScraping = jest.fn().mockResolvedValue({
  jobId: 'mock-scraping-job-id',
  status: 'queued'
});

const startRecurringTelegramScraping = jest.fn().mockResolvedValue({
  success: true,
  message: 'Recurring scraping started'
});

const stopRecurringTelegramScraping = jest.fn().mockResolvedValue({
  success: true,
  message: 'Recurring scraping stopped'
});

const getTelegramScrapingStatus = jest.fn().mockResolvedValue({
  isRunning: false,
  lastRun: null,
  nextRun: null
});

module.exports = {
  addJob,
  reportParsingQueue: mockQueue,
  telegramScrapingQueue: mockQueue,
  cleanup,
  triggerTelegramScraping,
  startRecurringTelegramScraping,
  stopRecurringTelegramScraping,
  getTelegramScrapingStatus
}; 