// Manual mock for queueService - prevents Redis connections during tests

// Mock queue service for testing
const reportParsingQueue = {
  process: jest.fn(),
  add: jest.fn().mockResolvedValue({ id: 'mock-job-id' }),
  on: jest.fn(),
  close: jest.fn().mockResolvedValue()
};

const telegramScrapingQueue = {
  process: jest.fn(),
  add: jest.fn().mockResolvedValue({ id: 'mock-scraping-job-id' }),
  removeRepeatable: jest.fn().mockResolvedValue(),
  on: jest.fn(),
  close: jest.fn().mockResolvedValue()
};

const reportProcessingQueue = {
  process: jest.fn(),
  add: jest.fn().mockResolvedValue({ id: 'mock-processing-job-id' }),
  removeRepeatable: jest.fn().mockResolvedValue(),
  on: jest.fn(),
  close: jest.fn().mockResolvedValue()
};

const startTelegramScraping = jest.fn().mockResolvedValue({
  success: true,
  message: 'Telegram scraping started'
});

const stopTelegramScraping = jest.fn().mockResolvedValue({
  success: true,
  message: 'Telegram scraping stopped'
});

const startBatchReportProcessing = jest.fn().mockResolvedValue({
  success: true,
  message: 'Batch report processing started'
});

const stopBatchReportProcessing = jest.fn().mockResolvedValue({
  success: true,
  message: 'Batch report processing stopped'
});

const triggerManualScraping = jest.fn().mockResolvedValue({
  id: 'mock-manual-job-id',
  success: true
});

const addJob = jest.fn().mockResolvedValue({ id: 'mock-job-id' });

const cleanup = jest.fn().mockResolvedValue();

module.exports = {
  reportParsingQueue,
  telegramScrapingQueue,
  reportProcessingQueue,
  startTelegramScraping,
  stopTelegramScraping,
  startBatchReportProcessing,
  stopBatchReportProcessing,
  triggerManualScraping,
  addJob,
  cleanup
}; 