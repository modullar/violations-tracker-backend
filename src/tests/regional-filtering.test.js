/**
 * Regional Filtering Test Suite
 * 
 * This file imports and runs all regional filtering tests in the correct order.
 * It serves as the main entry point for running regional filtering tests.
 */

describe('Regional Filtering System', () => {
  describe('Unit Tests', () => {
    // TelegramScraper regional filtering tests
    require('./services/telegramScraper.regionalFiltering.test');
    
    // Report model regional filtering tests
    require('./models/report.regionalFiltering.test');
    
    // ReportController regional filtering tests
    require('./controllers/reportController.regionalFiltering.test');
  });

  describe('Integration Tests', () => {
    // Full system integration tests
    require('./integration/regionalFiltering.integration.test');
  });
}); 