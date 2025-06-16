const nock = require('nock');
const claudeParser = require('../../services/claudeParser');
const dotenv = require('dotenv');

// Load test environment variables
dotenv.config({ path: '.env.test' });

describe('ClaudeParser Service Tests', () => {
  beforeEach(() => {
    // Always clean up nock interceptors and set up fresh ones
    nock.cleanAll();
    
    // Set up the API key for testing and reinitialize the service
    process.env.CLAUDE_API_KEY = 'test-api-key';
    
    // Re-initialize the service with the test API key
    claudeParser.apiKey = 'test-api-key';
    
    // Set up global nock interceptor to catch any requests that might slip through
    nock('https://api.anthropic.com')
      .persist()
      .post('/v1/messages')
      .query(true) // Accept any query parameters
      .reply(200, {
        content: [{ text: 'Default mock response' }]
      });
    
    if (!process.env.CLAUDE_API_KEY) {
      console.warn('CLAUDE_API_KEY is not set. Tests will only work with existing fixtures.');
    }
  });

  afterEach(() => {
    // Clean up nock
    nock.cleanAll();
  });

  // Add global teardown to close any open handles
  afterAll(async () => {
    // Force close any open handles
    nock.cleanAll();
    nock.restore();
    
    // Give time for cleanup
    await new Promise(resolve => setTimeout(resolve, 100));
  });

  describe('parseReport', () => {
    it('should parse a report and return violations array', async () => {
      // Clear default mock and set up specific mock for this test
      nock.cleanAll();
      nock('https://api.anthropic.com')
        .post('/v1/messages')
        .matchHeader('content-type', 'application/json')
        .matchHeader('x-api-key', (val) => !!val) // Just check that API key exists
        .reply(200, {
          content: [{
            text: `Here's the structured data I extracted from the report:

\`\`\`json
[
  {
    "type": "OTHER",
    "date": "2023-05-15",
    "location": {
      "name": {
        "en": "Syria",
        "ar": "سوريا"
      },
      "administrative_division": {
        "en": "Syria",
        "ar": "سوريا"
      }
    },
    "description": {
      "en": "Test report about human rights violations in Syria.",
      "ar": ""
    },
    "source": {
      "en": "Test Source",
      "ar": ""
    },
    "verified": false,
    "certainty_level": "possible",
    "casualties": 0,
    "injured_count": 0,
    "kidnapped_count": 0,
    "perpetrator": {
      "en": "Unknown",
      "ar": ""
    },
    "perpetrator_affiliation": "unknown"
  }
]
\`\`\``
          }]
        });

      // Mock data
      const reportText = 'This is a test report about human rights violations in Syria.';
      const source = { name: 'Test Source', url: 'https://example.com' };

      // Call the function
      const result = await claudeParser.parseReport(reportText, source);

      // Verify the result is an array
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
      
      // Verify structure
      const violation = result[0];
      expect(violation).toHaveProperty('type');
      expect(violation).toHaveProperty('date');
      expect(violation).toHaveProperty('location');
      expect(violation).toHaveProperty('description');
      expect(violation).toHaveProperty('verified');
      expect(violation).toHaveProperty('certainty_level');
    });

    it('should throw an error if Claude API key is not configured', async () => {
      // Save original API key
      const originalApiKey = claudeParser.apiKey;
      
      try {
        // Remove API key from the service instance
        claudeParser.apiKey = null;
        
        // Call function and expect it to throw
        await expect(claudeParser.parseReport('test')).rejects.toThrow('Claude API key is not configured');
      } finally {
        // Restore original API key
        claudeParser.apiKey = originalApiKey;
      }
    });

    it('should throw an error if no JSON is found in the response', async () => {
      // Clear default mock and set up specific mock for this test
      nock.cleanAll();
      nock('https://api.anthropic.com')
        .post('/v1/messages')
        .matchHeader('content-type', 'application/json')
        .reply(200, {
          // Missing content array entirely
          invalid_structure: 'This will cause an error'
        });

      // Call function and expect it to throw
      await expect(claudeParser.parseReport('test')).rejects.toThrow();
    });

    it('should throw an error if JSON parsing fails', async () => {
      // Clear default mock and set up specific mock for this test
      nock.cleanAll();
      nock('https://api.anthropic.com')
        .post('/v1/messages')
        .matchHeader('content-type', 'application/json')
        .reply(200, {
          content: [{ text: '```json\nThis is not valid JSON\n```' }]
        });

      // Call function and expect it to throw
      await expect(claudeParser.parseReport('test')).rejects.toThrow(/Failed to parse JSON|Claude API error/);
    });
  });

  describe('validateViolations', () => {
    it('should validate violations using model validation', async () => {
      // Mock the Violation model's validateBatch method
      const mockValidateBatch = jest.fn().mockResolvedValue({
        valid: [
          {
            type: 'AIRSTRIKE',
            date: '2023-05-15',
            location: {
              name: { en: 'Aleppo', ar: 'حلب' },
              administrative_division: { en: 'Aleppo Governorate', ar: '' }
            },
            description: { en: 'Valid description', ar: '' },
            verified: false,
            certainty_level: 'probable',
            casualties: 2,
            detained_count: 1,
            injured_count: 3
          }
        ],
        invalid: [
          {
            index: 1,
            violation: {
              date: '2023-05-16',
              location: {
                name: { en: 'Damascus', ar: 'دمشق' },
                administrative_division: { en: 'Damascus Governorate', ar: '' }
              },
              description: { en: 'Missing type', ar: '' },
              verified: false,
              certainty_level: 'confirmed',
              detained_count: 2
            },
            errors: ['Violation type is required']
          }
        ]
      });

      // Mock the require call for the Violation model
      jest.doMock('../../models/Violation', () => ({
        validateBatch: mockValidateBatch
      }));

      // Sample violations array with both valid and invalid items
      const violations = [
        {
          // Valid violation
          type: 'AIRSTRIKE',
          date: '2023-05-15',
          location: {
            name: { en: 'Aleppo', ar: 'حلب' },
            administrative_division: { en: 'Aleppo Governorate', ar: '' }
          },
          description: { en: 'Valid description', ar: '' },
          verified: false,
          certainty_level: 'probable',
          casualties: 2,
          detained_count: 1,
          injured_count: 3
        },
        {
          // Missing type
          date: '2023-05-16',
          location: {
            name: { en: 'Damascus', ar: 'دمشق' },
            administrative_division: { en: 'Damascus Governorate', ar: '' }
          },
          description: { en: 'Missing type', ar: '' },
          verified: false,
          certainty_level: 'confirmed',
          detained_count: 2
        }
      ];

      // Call the validation function
      const result = await claudeParser.validateViolations(violations);

      // Check that the model's validateBatch method was called
      expect(mockValidateBatch).toHaveBeenCalledWith(violations, { requiresGeocoding: false });

      // Check that the result has the expected structure
      expect(result.valid).toHaveLength(1);
      expect(result.invalid).toHaveLength(1);
      expect(result.valid[0].type).toBe('AIRSTRIKE');
      expect(result.invalid[0].index).toBe(1);
      expect(result.invalid[0].errors).toContain('Violation type is required');
    });
  });
});