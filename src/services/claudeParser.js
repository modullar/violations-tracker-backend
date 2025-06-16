const axios = require('axios');
const logger = require('../config/logger');
const parseInstructions = require('../config/parseInstructions');

/**
 * Service to parse human rights violation reports using Claude API
 */
class ClaudeParserService {
  constructor() {
    // Initialize with the API key from environment variables
    this.apiKey = process.env.CLAUDE_API_KEY;
    this.apiEndpoint = process.env.CLAUDE_API_ENDPOINT || 'https://api.anthropic.com/v1/messages';
    this.model = process.env.CLAUDE_MODEL || 'claude-3-5-sonnet-20240620';
    this.maxTokens = parseInt(process.env.CLAUDE_MAX_TOKENS) || 4096;
  }

  /**
   * Parse a report text using Claude API
   * @param {string} reportText - The report text to parse
   * @param {Object} source - Source information
   * @returns {Promise<Array>} - Array of parsed violations
   */
  async parseReport(reportText, source = {}) {
    try {
      logger.info('Starting report parsing with Claude API');
      
      if (!this.apiKey) {
        throw new Error('Claude API key is not configured');
      }

      const sourceInfo = source.name ? 
        `Report source: ${source.name}${source.url ? ` (${source.url})` : ''}${source.reportDate ? ` published on ${source.reportDate}` : ''}` : 
        'No source information provided';

      // Prepare the request to Claude API
      const response = await axios.post(
        this.apiEndpoint,
        {
          model: this.model,
          max_tokens: this.maxTokens,
          system: parseInstructions.SYSTEM_PROMPT,
          messages: [
            {
              role: 'user',
              content: `${parseInstructions.USER_PROMPT}\n\nSOURCE INFO: ${sourceInfo}\n\nREPORT TEXT:\n${reportText}`
            }
          ]
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': this.apiKey,
            'anthropic-version': '2023-06-01'
          },
          timeout: 120000 // 2 minute timeout
        }
      );

      const content = response.data.content[0].text;
      
      // Extract JSON array from response
      const jsonMatch = content.match(/```json\n([\s\S]*?)\n```/) || 
                        content.match(/```\n([\s\S]*?)\n```/) || 
                        content.match(/```([\s\S]*?)```/);
      
      if (!jsonMatch) {
        logger.error('No JSON found in Claude response');
        throw new Error('Failed to extract structured data from the response');
      }

      let violations;
      try {
        violations = JSON.parse(jsonMatch[1]);
        
        if (!Array.isArray(violations)) {
          // Try to extract array if the response is an object with an array property
          const possibleArrayProps = Object.values(violations).filter(v => Array.isArray(v));
          if (possibleArrayProps.length > 0) {
            violations = possibleArrayProps[0];
          } else {
            throw new Error('Response is not an array');
          }
        }
      } catch (error) {
        logger.error(`JSON parse error: ${error.message}`);
        throw new Error(`Failed to parse JSON from Claude response: ${error.message}`);
      }

      logger.info(`Successfully parsed ${violations.length} violations from report`);
      return violations;
    } catch (error) {
      // Better error logging with full details
      if (error.response) {
        // The request was made and the server responded with a non-2xx status
        logger.error(`Claude API error: ${error.message}`, {
          status: error.response.status,
          statusText: error.response.statusText,
          data: error.response.data,
          headers: error.response.headers
        });
      } else if (error.request) {
        // The request was made but no response was received
        logger.error(`Claude API request error: ${error.message}`, {
          request: error.request
        });
      } else {
        // Something happened in setting up the request
        logger.error(`Claude API setup error: ${error.message}`, {
          error: error.stack
        });
      }

      // Create a more detailed error to throw
      const enhancedError = new Error(
        `Claude API error: ${error.message} ${
          error.response?.data ? `- ${JSON.stringify(error.response.data)}` : ''
        }`
      );
      
      // Attach original error details for debugging
      enhancedError.originalError = error;
      enhancedError.responseData = error.response?.data;
      enhancedError.responseStatus = error.response?.status;
      
      // Rethrow enhanced error
      throw enhancedError;
    }
  }

  /**
   * Validate parsed violations against the Violation schema
   * @param {Array} violations - Array of parsed violations
   * @returns {Object} - Object containing valid and invalid violations
   */
  validateViolations(violations) {
    // Use the model's batch validation method
    const Violation = require('../models/Violation');
    return Violation.validateBatch(violations, { requiresGeocoding: false });
  }
}

module.exports = new ClaudeParserService();