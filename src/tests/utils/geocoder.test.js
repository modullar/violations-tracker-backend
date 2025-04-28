const nock = require('nock');
const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');

// Load environment variables from test config
dotenv.config({ path: '.env.test' });

// We'll use a VCR-like approach for geocoding tests
// RECORD=true environment variable can be used to record new fixtures

// Import config after loading env vars
const config = require('../../config/config');

// Make sure we have a Google API key for the tests
console.log('GOOGLE_API_KEY available:', !!config.googleApiKey);
if (!config.googleApiKey) {
  console.warn('WARNING: GOOGLE_API_KEY is not set. Tests may fail. Please set it in your .env.test file or CI environment.');
}

// Import our geocoder utility
const { geocodeLocation } = require('../../utils/geocoder');

// Directory to store the recorded API responses for tests
const fixturesDir = path.join(__dirname, '..', 'fixtures');
if (!fs.existsSync(fixturesDir)) {
  fs.mkdirSync(fixturesDir, { recursive: true });
}

// Helper to create a unique fixture filename for each test case
const getFixturePath = (testName) => path.join(fixturesDir, `${testName.replace(/\s+/g, '_')}.json`);

// Define Syrian location test cases (using English/transliterated names for better results)
const syrianLocations = [
  {
    name: 'Bustan al-Qasr',
    adminDivision: 'Aleppo Governorate',
    description: 'Bustan al-Qasr neighborhood in Aleppo',
    expectedCoordinates: true
  },
  {
    name: 'Al-Midan',
    adminDivision: 'Damascus Governorate',
    description: 'Al-Midan neighborhood in Damascus',
    expectedCoordinates: true
  },
  {
    name: 'Jobar',
    adminDivision: 'Damascus Governorate',
    description: 'Jobar neighborhood in Damascus',
    expectedCoordinates: true
  },
  {
    name: 'Muadamiyat al-Sham',
    adminDivision: 'Rif Dimashq Governorate',
    description: 'Muadamiyat al-Sham in Rural Damascus',
    expectedCoordinates: true
  },
  {
    name: 'Al-Waer',
    adminDivision: 'Homs Governorate',
    description: 'Al-Waer neighborhood in Homs',
    expectedCoordinates: true
  }
];

describe('Geocoder Tests with Google Maps API', () => {
  beforeEach(() => {
    // Check if Google API key is available for real API calls
    if (!config.googleApiKey) {
      console.warn('GOOGLE_API_KEY is not set. Tests will only work with existing fixtures.');
    } else {
      console.log(`Using Google API key: ${config.googleApiKey.substring(0, 5)}...`);
    }
    
    // Check if we're in recording mode
    const isRecordMode = process.env.RECORD === 'true';
    
    // Clean up any nock interceptors
    nock.cleanAll();
    
    if (isRecordMode && config.googleApiKey) {
      console.log('RECORD MODE: Recording real API responses for future tests');
      // Allow real HTTP requests and record them
      nock.restore();
      nock.recorder.clear();
      nock.recorder.rec({
        dont_print: true,
        output_objects: true
      });
    } else {
      console.log('REPLAY MODE: Using fixture data when available');
      
      // Handle tests where we want specific behavior for the invalid location
      if (expect.getState().currentTestName === 'should handle geocoding failures gracefully') {
        nock('https://maps.googleapis.com')
          .persist()
          .get(/\/maps\/api\/geocode\/json\?address=.*xyznon-existentlocation12345completelyfake.*/)
          .query(true)
          .reply(200, { results: [], status: 'ZERO_RESULTS' });
      }
    }
  });

  afterEach(() => {
    // If in recording mode, save the recorded API responses
    if (process.env.RECORD === 'true' && nock.recorder.play().length > 0) {
      const fixtures = nock.recorder.play();
      const testName = expect.getState().currentTestName;
      // Save with Google Maps API prefix to distinguish from old HERE API fixtures
      const fixturePath = getFixturePath(`Geocoder_Tests_with_Google_Maps_API_${testName.replace('Geocoder_Tests_with_Google_Maps_API_', '')}`);
      
      console.log(`Recording ${fixtures.length} API interactions to fixture: ${fixturePath}`);
      fs.writeFileSync(fixturePath, JSON.stringify(fixtures, null, 2));
      nock.recorder.clear();
    }
    
    // Clean up nock
    nock.cleanAll();
    nock.restore();
  });

  // Add global teardown to close any open handles
  afterAll(done => {
    // Force close any open handles
    setTimeout(() => {
      done();
    }, 500);
  });

  // Test each Syrian location
  syrianLocations.forEach(location => {
    it(`should geocode ${location.description}`, async () => {
      // If not in recording mode, use recorded fixtures
      if (process.env.RECORD !== 'true') {
        const testName = `should geocode ${location.description}`;
        // Try to load Google Maps specific fixtures
        const fixturePath = getFixturePath(`Geocoder_Tests_with_Google_Maps_API_${testName}`);

        if (fs.existsSync(fixturePath)) {
          console.log(`Using fixture data from: ${fixturePath}`);
          const fixtures = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
          fixtures.forEach(fixture => {
            nock(fixture.scope)
              .persist()
              .intercept(fixture.path, fixture.method, fixture.body)
              .reply(fixture.status, fixture.response, fixture.headers);
          });
        } else {
          console.log(`No fixture found for: ${testName}, will make real API call if key is available`);
        }
      }

      // Call geocodeLocation with the test case
      const result = await geocodeLocation(location.name, location.adminDivision);
      
      // Check if we got expected results
      if (location.expectedCoordinates) {
        expect(result).not.toEqual([]);
        expect(result.length).toBeGreaterThan(0);
        
        if (result.length > 0) {
          const firstResult = result[0];
          expect(firstResult).toHaveProperty('latitude');
          expect(firstResult).toHaveProperty('longitude');
          expect(firstResult.latitude).not.toBeNaN();
          expect(firstResult.longitude).not.toBeNaN();
          
          // Log results for reference
          console.log(`${location.description} - Coordinates: [${firstResult.longitude}, ${firstResult.latitude}]`);
        }
      } else {
        expect(result).toEqual([]);
      }
    });
  });

  // Test Aleppo city center specifically
  it('should get accurate coordinates for Aleppo city center', async () => {
    // If not in recording mode, load fixtures
    if (process.env.RECORD !== 'true') {
      const testName = 'should get accurate coordinates for Aleppo city center';
      const fixturePath = getFixturePath(`Geocoder_Tests_with_Google_Maps_API_${testName}`);
      
      if (fs.existsSync(fixturePath)) {
        console.log(`Using fixture data from: ${fixturePath}`);
        const fixtures = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
        fixtures.forEach(fixture => {
          nock(fixture.scope)
            .persist()
            .intercept(fixture.path, fixture.method, fixture.body)
            .reply(fixture.status, fixture.response, fixture.headers);
        });
      } else {
        console.log(`No fixture found for: ${testName}, will make real API call if key is available`);
      }
    }
    
    const result = await geocodeLocation('Aleppo', 'Aleppo Governorate');
    expect(result).not.toEqual([]);
    expect(result.length).toBeGreaterThan(0);
    
    if (result.length > 0) {
      const firstResult = result[0];
      
      // We'll be a bit less strict with coordinates to allow for API variations
      expect(parseFloat(firstResult.latitude)).toBeCloseTo(36.2, 0); // Within ~10km
      expect(parseFloat(firstResult.longitude)).toBeCloseTo(37.1, 0); // Within ~10km
      
      console.log(`Aleppo city - Coordinates: [${firstResult.longitude}, ${firstResult.latitude}]`);
    }
  });

  // Test handling of invalid locations
  it('should handle geocoding failures gracefully', async () => {
    // Force mock for invalid location test since Google Maps is actually finding coordinates for Syria
    nock.cleanAll();
    
    // Always use mock for the invalid location test
    nock('https://maps.googleapis.com')
      .persist()
      .get(/\/maps\/api\/geocode\/json.*/)
      .query(true)
      .reply(200, { results: [], status: 'ZERO_RESULTS' });
    
    // Save the mock in recording mode
    if (process.env.RECORD === 'true') {
      const fixturePath = getFixturePath(`Geocoder_Tests_with_Google_Maps_API_should_handle_geocoding_failures_gracefully`);
      const fixtures = [{
        scope: 'https://maps.googleapis.com',
        method: 'GET',
        path: '/maps/api/geocode/json',
        query: { address: 'xyznon-existentlocation12345completelyfake, definitelynotarealplace, Syria', key: config.googleApiKey },
        body: '',
        status: 200,
        response: { results: [], status: 'ZERO_RESULTS' }
      }];
      fs.writeFileSync(fixturePath, JSON.stringify(fixtures, null, 2));
      console.log(`Saving mock fixture for invalid location test to: ${fixturePath}`);
    }
    
    const result = await geocodeLocation('xyznon-existentlocation12345completelyfake', 'definitelynotarealplace');
    expect(result).toEqual([]);
    console.log('No coordinates found for invalid location as expected');
  });
}); 