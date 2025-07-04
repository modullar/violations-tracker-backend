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

// Methods for Telegram scraping
const triggerTelegramScraping = jest.fn().mockResolvedValue({
  jobId: 'mock-scraping-job-id',
  status: 'queued'
});

const startTelegramScraping = jest.fn().mockResolvedValue({
  success: true,
  message: 'Telegram scraping started'
});

const stopTelegramScraping = jest.fn().mockResolvedValue({
  success: true,
  message: 'Telegram scraping stopped'
});

const triggerManualScraping = jest.fn().mockResolvedValue({
  id: 'mock-manual-scraping-job-id'
});

// Methods for batch report processing
const startBatchReportProcessing = jest.fn().mockResolvedValue({
  success: true,
  message: 'Batch report processing started'
});

const stopBatchReportProcessing = jest.fn().mockResolvedValue({
  success: true,
  message: 'Batch report processing stopped'
});

module.exports = {
  addJob,
  reportParsingQueue: mockQueue,
  telegramScrapingQueue: mockQueue,
  reportProcessingQueue: mockQueue,
  cleanup,
  triggerTelegramScraping,
  startTelegramScraping,
  stopTelegramScraping,
  startBatchReportProcessing,
  stopBatchReportProcessing,
  triggerManualScraping
}; 