const axios = require('axios');
const claudeParser = require('../../services/claudeParser');
const parseInstructions = require('../../config/parseInstructions');
const dotenv = require('dotenv');

// Load test environment variables
dotenv.config({ path: '.env.test' });

// Mock dependencies
jest.mock('axios');
jest.mock('../../config/logger');

describe('ClaudeParser Service Tests', () => {
  beforeEach(() => {
    // Reset mock implementations before each test
    jest.clearAllMocks();
  });

  afterEach(() => {
    // Clear environment variables after each test
    delete process.env.CLAUDE_API_KEY;
  });

  describe('parseReport', () => {
    it('should parse a report and return violations array', async () => {
      // Mock data
      const reportText = 'This is a test report about human rights violations in Syria.';
      const source = { name: 'Test Source', url: 'https://example.com' };
      
      // Sample Claude API response with JSON
      const mockApiResponse = {
        data: {
          content: [
            {
              text: `Here's the structured data I extracted from the report:

\`\`\`json
[
  {
    "type": "AIRSTRIKE",
    "date": "2023-05-15",
    "location": {
      "name": {
        "en": "Aleppo",
        "ar": "حلب"
      },
      "administrative_division": {
        "en": "Aleppo Governorate",
        "ar": "محافظة حلب"
      }
    },
    "description": {
      "en": "An airstrike hit a residential building.",
      "ar": ""
    },
    "source": {
      "en": "Test Source",
      "ar": ""
    },
    "verified": false,
    "certainty_level": "probable",
    "casualties": 5,
    "injured_count": 12,
    "kidnapped_count": 0,
    "perpetrator": {
      "en": "Unknown forces",
      "ar": ""
    },
    "perpetrator_affiliation": "unknown"
  }
]
\`\`\``
            }
          ]
        }
      };

      // Setup axios mock to return the sample response
      axios.post.mockResolvedValue(mockApiResponse);

      // Call the function
      const result = await claudeParser.parseReport(reportText, source);

      // Verify axios was called with the correct parameters
      expect(axios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          model: expect.any(String),
          messages: [
            { role: 'system', content: parseInstructions.SYSTEM_PROMPT },
            { role: 'user', content: expect.stringContaining(reportText) }
          ]
        }),
        expect.objectContaining({
          headers: expect.objectContaining({
            'x-api-key': 'test-api-key'
          })
        })
      );

      // Verify the result is as expected
      expect(result).toEqual([
        {
          type: 'AIRSTRIKE',
          date: '2023-05-15',
          location: {
            name: { en: 'Aleppo', ar: 'حلب' },
            administrative_division: { en: 'Aleppo Governorate', ar: 'محافظة حلب' }
          },
          description: { en: 'An airstrike hit a residential building.', ar: '' },
          source: { en: 'Test Source', ar: '' },
          verified: false,
          certainty_level: 'probable',
          casualties: 5,
          injured_count: 12,
          kidnapped_count: 0,
          perpetrator: { en: 'Unknown forces', ar: '' },
          perpetrator_affiliation: 'unknown'
        }
      ]);
    });

    it('should throw an error if Claude API key is not configured', async () => {
      // Remove API key from env
      delete process.env.CLAUDE_API_KEY;

      // Call function and expect it to throw
      await expect(claudeParser.parseReport('test')).rejects.toThrow('Claude API key is not configured');
    });

    it('should throw an error if no JSON is found in the response', async () => {
      // Mock a response without JSON
      axios.post.mockResolvedValue({
        data: {
          content: [{ text: 'This response contains no JSON data.' }]
        }
      });

      // Call function and expect it to throw
      await expect(claudeParser.parseReport('test')).rejects.toThrow('Failed to extract structured data');
    });

    it('should throw an error if JSON parsing fails', async () => {
      // Mock a response with invalid JSON
      axios.post.mockResolvedValue({
        data: {
          content: [{ text: '```json\nThis is not valid JSON\n```' }]
        }
      });

      // Call function and expect it to throw
      await expect(claudeParser.parseReport('test')).rejects.toThrow('Failed to parse JSON');
    });
  });

  describe('validateViolations', () => {
    it('should validate violations and separate valid from invalid', () => {
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
        },
        {
          // Missing location name
          type: 'SHELLING',
          date: '2023-05-17',
          location: {
            administrative_division: { en: 'Homs Governorate', ar: '' }
          },
          description: { en: 'Missing location name', ar: '' },
          verified: false,
          certainty_level: 'possible',
          detained_count: 1
        }
      ];

      // Call the validation function
      const { valid, invalid } = claudeParser.validateViolations(violations);

      // Check that only the valid violation is in the valid array
      expect(valid.length).toBe(1);
      expect(valid[0].type).toBe('AIRSTRIKE');

      // Check that the invalid violations are in the invalid array
      expect(invalid.length).toBe(2);
      expect(invalid[0].error).toContain('Missing required fields');
      expect(invalid[1].error).toContain('Missing required location name');
    });
  });
});