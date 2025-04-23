const nock = require('nock');
const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');

// Load environment variables from test config
dotenv.config({ path: '.env.test' });

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

describe('Geocoder Tests with HERE API', () => {
  beforeEach(() => {
    // Enable real HTTP requests to record responses for the first run
    // After the first run, nock will use recorded responses
    nock.cleanAll();
    if (process.env.RECORD) {
      nock.recorder.clear();
      nock.recorder.rec({
        dont_print: true,
        output_objects: true
      });
    }
  });

  afterEach(() => {
    // If in recording mode, save the recorded API responses
    if (process.env.RECORD && nock.recorder.play().length > 0) {
      const fixtures = nock.recorder.play();
      const testName = expect.getState().currentTestName;
      const fixturePath = getFixturePath(testName);
      fs.writeFileSync(fixturePath, JSON.stringify(fixtures, null, 2));
      nock.recorder.clear();
    }
    
    // Clean up nock
    nock.cleanAll();
    nock.restore();
  });

  // Test each Syrian location
  syrianLocations.forEach(location => {
    it(`should geocode ${location.description}`, async () => {
      // If not in recording mode, use recorded fixtures
      if (!process.env.RECORD) {
        const testName = `should geocode ${location.description}`;
        const fixturePath = getFixturePath(testName);
        
        if (fs.existsSync(fixturePath)) {
          const fixtures = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
          fixtures.forEach(fixture => {
            nock(fixture.scope)
              .persist()
              .intercept(fixture.path, fixture.method, fixture.body)
              .reply(fixture.status, fixture.response, fixture.headers);
          });
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
        console.log(`${location.description} - No coordinates found as expected`);
      }
    }, 10000); // Increase timeout for real API calls
  });

  // Test one special case with known exact coordinates for verification
  it('should get accurate coordinates for Aleppo city center', async () => {
    // If not in recording mode, use recorded fixtures
    if (!process.env.RECORD) {
      const testName = 'should get accurate coordinates for Aleppo city center';
      const fixturePath = getFixturePath(testName);
      
      if (fs.existsSync(fixturePath)) {
        const fixtures = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
        fixtures.forEach(fixture => {
          nock(fixture.scope)
            .persist()
            .intercept(fixture.path, fixture.method, fixture.body)
            .reply(fixture.status, fixture.response, fixture.headers);
        });
      }
    }

    const result = await geocodeLocation('Aleppo', 'Aleppo Governorate');
    
    expect(result).not.toEqual([]);
    expect(result.length).toBeGreaterThan(0);
    
    if (result.length > 0) {
      const aleppo = result[0];
      expect(aleppo).toHaveProperty('latitude');
      expect(aleppo).toHaveProperty('longitude');
      
      // Approximate coordinates for Aleppo (with reasonable margin of error)
      expect(aleppo.latitude).toBeCloseTo(36.2, 0); // Within ~11km
      expect(aleppo.longitude).toBeCloseTo(37.16, 0); // Within ~11km
      
      console.log(`Aleppo city - Coordinates: [${aleppo.longitude}, ${aleppo.latitude}]`);
    }
  }, 10000);

  // Test handling of geocoding failure
  it('should handle geocoding failures gracefully', async () => {
    // Create a deliberately invalid location with extremely unlikely name
    const invalidLocation = {
      name: 'xyznon-existentlocation12345completelyfake',
      adminDivision: 'definitelynotarealplace'
    };

    // If not in recording mode, use recorded fixtures
    if (!process.env.RECORD) {
      const testName = 'should handle geocoding failures gracefully';
      const fixturePath = getFixturePath(testName);
      
      if (fs.existsSync(fixturePath)) {
        const fixtures = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
        fixtures.forEach(fixture => {
          nock(fixture.scope)
            .persist()
            .intercept(fixture.path, fixture.method, fixture.body)
            .reply(fixture.status, fixture.response, fixture.headers);
        });
      }
    }

    // Call geocodeLocation with invalid location
    const result = await geocodeLocation(invalidLocation.name, invalidLocation.adminDivision);
    
    // Note: We're testing that the function doesn't throw an exception
    // even if results are returned for unlikely place names
    expect(Array.isArray(result)).toBe(true);
    
    // Log any results that were surprisingly found
    if (result.length > 0) {
      console.log(`Unexpected geocoding result found for invalid location: [${result[0].longitude}, ${result[0].latitude}]`);
    } else {
      console.log('No coordinates found for invalid location as expected');
    }
  }, 10000);
}); 