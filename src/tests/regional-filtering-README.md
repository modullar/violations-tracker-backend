# Regional Filtering Tests

This document describes the comprehensive test suite for the regional filtering system in the Syria Violations Tracker backend.

## Overview

The regional filtering system allows channels to be assigned specific regions/governorates, and reports that don't mention these regions are filtered out **before** being sent to the Claude API, resulting in significant cost savings.

## Test Structure

### Unit Tests

#### 1. TelegramScraper Regional Filtering Tests
**File:** `src/tests/services/telegramScraper.regionalFiltering.test.js`

**Tests:**
- `checkRegionMatch()` method functionality
- `getRegionAliases()` method functionality  
- `applyEnhancedFiltering()` with regional filtering
- `scrapeChannel()` with regional filtering tracking
- Mixed Arabic/English region name handling
- Case-insensitive matching
- Alias recognition (العاصمة → دمشق, damascus → دمشق)

**Key Features Tested:**
- Direct region mentions
- Region aliases and variations
- English/Arabic mixed content
- Unique match deduplication
- Filter type tracking (`regionFiltered` count)

#### 2. Report Model Regional Filtering Tests
**File:** `src/tests/models/report.regionalFiltering.test.js`

**Tests:**
- `getRegionalFilteringStats()` static method
- Time range filtering
- Error message pattern matching
- Case-insensitive regex matching
- Null/undefined error handling
- Channel grouping
- Custom time range parameters

**Key Features Tested:**
- MongoDB aggregation pipeline
- Regex pattern matching for error messages
- Time-based filtering
- Statistics calculation

#### 3. ReportController Regional Filtering Tests
**File:** `src/tests/controllers/reportController.regionalFiltering.test.js`

**Tests:**
- Authentication and authorization
- GET `/api/reports/regional-stats` endpoint
- Custom time range parameters
- Channel breakdown statistics
- Cost savings calculation
- Error handling

**Key Features Tested:**
- Admin-only access control
- HTTP request/response handling
- Statistics aggregation
- Parameter validation
- JSON response formatting

### Integration Tests

#### 4. Regional Filtering Integration Tests
**File:** `src/tests/integration/regionalFiltering.integration.test.js`

**Tests:**
- End-to-end workflow testing
- Multiple channel configurations
- Cost savings demonstration
- Complex regional aliases
- Performance and scalability
- Error handling and edge cases

**Key Features Tested:**
- Complete scraping → filtering → statistics flow
- Multiple channels with different regional settings
- Real-world message scenarios
- Performance benchmarks
- Error recovery

## Running the Tests

### Run All Regional Filtering Tests
```bash
npm test -- --testPathPattern=regional-filtering.test.js
```

### Run Individual Test Suites
```bash
# TelegramScraper tests
npm test -- --testPathPattern=telegramScraper.regionalFiltering.test.js

# Report model tests
npm test -- --testPathPattern=report.regionalFiltering.test.js

# Controller tests
npm test -- --testPathPattern=reportController.regionalFiltering.test.js

# Integration tests
npm test -- --testPathPattern=regionalFiltering.integration.test.js
```

### Run with Coverage
```bash
npm test -- --coverage --testPathPattern=regional-filtering
```

### Run with Watch Mode
```bash
npm test -- --watch --testPathPattern=regional-filtering
```

## Test Scenarios

### 1. Basic Regional Filtering
- **Damascus channel** processes only Damascus-related reports
- **Aleppo channel** processes only Aleppo-related reports
- Reports mentioning other regions are filtered out

### 2. Regional Aliases
- `العاصمة` → `دمشق` (Capital → Damascus)
- `damascus` → `دمشق` (English → Arabic)
- `حلب الشهباء` → `حلب` (Aleppo the Grey → Aleppo)
- `غوطة` → `ريف دمشق` (Ghouta → Damascus Countryside)

### 3. Cost Savings Demonstration
- **Test scenario:** 10 messages, 6 filtered by region
- **Expected result:** 60% cost savings
- **Verification:** Only 4 messages processed by Claude API

### 4. Multi-Channel Configuration
- **Damascus Channel:** `["دمشق", "ريف دمشق"]`
- **Aleppo Channel:** `["حلب", "ريف حلب"]`
- **Multi-Region Channel:** `["دمشق", "حلب", "حمص", "درعا"]`
- **No Filtering Channel:** No regional restrictions

### 5. Performance Testing
- **Test scenario:** 100 messages processed
- **Expected result:** < 5 seconds execution time
- **Verification:** Efficient filtering without performance degradation

## Test Data

### Sample Test Messages
```javascript
const testMessages = [
  'قصف جوي في دمشق أدى إلى مقتل 3 مدنيين',           // Damascus - pass
  'انفجار في حلب أدى إلى مقتل 2 مدنيين',            // Aleppo - filtered
  'اعتقال في العاصمة السورية',                      // Damascus alias - pass
  'قصف في damascus city center',                  // English Damascus - pass
  'انفجار في غوطة دمشق',                           // Damascus countryside - pass
];
```

### Expected Filtering Results
For a Damascus-focused channel:
- ✅ **Pass:** Messages mentioning دمشق, العاصمة, damascus, ريف دمشق, غوطة
- ❌ **Filter:** Messages mentioning حلب, حمص, درعا, إدلب, etc.

## Mock Configuration

### Channel Configuration
```yaml
channels:
  - name: "damascus-focused"
    assigned_regions: ["دمشق", "ريف دمشق"]
    filtering:
      enforce_region_filter: true
      
  - name: "aleppo-focused"
    assigned_regions: ["حلب", "ريف حلب"]
    filtering:
      enforce_region_filter: true
```

### Region Aliases
```javascript
{
  "دمشق": ["العاصمة", "دمشق الشام", "الشام", "damascus"],
  "حلب": ["حلب الشهباء", "aleppo", "alep"],
  "ريف دمشق": ["ريف الشام", "damascus countryside", "غوطة"]
}
```

## Verification Methods

### 1. Filtering Metrics
```javascript
expect(result.regionFiltered).toBe(expectedFilteredCount);
expect(result.newReports).toBe(expectedPassedCount);
```

### 2. Database Verification
```javascript
const savedReports = await Report.find({});
expect(savedReports).toHaveLength(expectedCount);
```

### 3. Statistics Verification
```javascript
expect(statsResponse.body.data.summary.costSavingsPercent).toBe('60.00');
```

### 4. Content Verification
```javascript
savedReports.forEach(report => {
  expect(report.text).toMatch(/دمشق|العاصمة|damascus|ريف دمشق/);
});
```

## Dependencies

### Test Dependencies
- `jest` - Testing framework
- `supertest` - HTTP testing
- `mongoose` - MongoDB testing
- `js-yaml` - YAML configuration parsing

### Mocked Dependencies
- `axios` - HTTP client for Telegram scraping
- `../../config/logger` - Logging system
- `../../middleware/auth` - Authentication middleware
- `fs` - File system operations

## Troubleshooting

### Common Issues

1. **Tests timing out**
   - Increase Jest timeout: `jest.setTimeout(30000)`
   - Check MongoDB connection

2. **Configuration not loading**
   - Verify YAML mock implementations
   - Check file path resolution

3. **Database cleanup issues**
   - Ensure proper cleanup in `beforeEach`
   - Check MongoDB connection state

4. **Mock HTTP client issues**
   - Verify axios mock setup
   - Check mock implementation order

### Debug Commands
```bash
# Run tests with verbose output
npm test -- --verbose --testPathPattern=regional-filtering

# Run specific test with debug info
npm test -- --testNamePattern="should filter out reports" --verbose
```

## Coverage Goals

- **Unit Tests:** 100% function coverage
- **Integration Tests:** End-to-end workflow coverage
- **Error Handling:** Exception and edge case coverage
- **Performance:** Load testing and benchmarks

## Continuous Integration

These tests are designed to run in CI/CD environments and include:
- Database setup/teardown
- Mock HTTP responses
- Deterministic test data
- Performance benchmarks
- Error recovery testing

The regional filtering system should maintain **>95% test coverage** to ensure reliability and cost-effectiveness of the filtering mechanism. 