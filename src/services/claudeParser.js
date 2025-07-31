const axios = require('axios');
const logger = require('../config/logger');
const parseInstructions = require('../config/parseInstructions');

/**
 * Extracts a JSON array from Claude API response content.
 * Handles code block and raw array responses.
 * @param {string} content - Claude API response content
 * @returns {Array} - Parsed JSON array
 * @throws {Error} - If no valid JSON array is found
 */
function extractViolationsJson(content) {
  logger.debug('Extracting JSON from Claude response:', { contentLength: content.length });
  
  // Try multiple patterns to extract JSON
  let jsonText = null;
  
  // Pattern 1: JSON code block with language specification
  let jsonMatch = content.match(/```json\s*\n([\s\S]*?)\n```/);
  if (jsonMatch) {
    jsonText = jsonMatch[1];
    logger.debug('Found JSON in code block with json language spec');
  }
  
  // Pattern 2: Generic code block
  if (!jsonText) {
    jsonMatch = content.match(/```\s*\n([\s\S]*?)\n```/);
    if (jsonMatch) {
      jsonText = jsonMatch[1];
      logger.debug('Found JSON in generic code block');
    }
  }
  
  // Pattern 3: Code block without newlines
  if (!jsonText) {
    jsonMatch = content.match(/```([\s\S]*?)```/);
    if (jsonMatch) {
      jsonText = jsonMatch[1];
      logger.debug('Found JSON in code block without newlines');
    }
  }
  
  // Pattern 4: Raw JSON array at the beginning or end
  if (!jsonText) {
    const trimmed = content.trim();
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      jsonText = trimmed;
      logger.debug('Found raw JSON array');
    }
  }
  
  // Pattern 5: Look for JSON array anywhere in the content
  if (!jsonText) {
    const arrayMatch = content.match(/\[\s*\{[\s\S]*?\}\s*\]/);
    if (arrayMatch) {
      jsonText = arrayMatch[0];
      logger.debug('Found JSON array embedded in text');
    }
  }
  
  // Pattern 6: Try to find any JSON-like structure
  if (!jsonText) {
    const jsonLikeMatch = content.match(/\{[\s\S]*?\}/g);
    if (jsonLikeMatch && jsonLikeMatch.length > 0) {
      // Try to parse as array of objects
      try {
        const potentialArray = `[${jsonLikeMatch.join(',')}]`;
        JSON.parse(potentialArray); // Test if valid
        jsonText = potentialArray;
        logger.debug('Found JSON-like structures and combined into array');
      } catch (e) {
        // Not valid JSON, continue
      }
    }
  }

  if (!jsonText) {
    logger.error('No JSON found in Claude response. Content preview:', content.substring(0, 500));
    throw new Error('Failed to extract structured data from the response. Claude may have returned an explanation instead of JSON.');
  }

  let violations;
  try {
    violations = JSON.parse(jsonText);
    
    // Handle case where response is an object with an array property
    if (!Array.isArray(violations)) {
      if (typeof violations === 'object' && violations !== null) {
        // Look for array properties
        const possibleArrayProps = Object.values(violations).filter(v => Array.isArray(v));
        if (possibleArrayProps.length > 0) {
          violations = possibleArrayProps[0];
          logger.debug('Extracted array from object property');
        } else {
          // If it's a single violation object, wrap it in an array
          if (violations.type && violations.date) {
            violations = [violations];
            logger.debug('Wrapped single violation object in array');
          } else {
            throw new Error('Response is not an array and does not contain valid violation data');
          }
        }
      } else {
        throw new Error('Response is not an array');
      }
    }
    
    // Validate that we have at least one violation with required fields
    if (violations.length === 0) {
      logger.debug('Empty violations array found');
      return [];
    }
    
    // Basic validation that we have an array of objects
    const validViolations = violations.filter(v => v && typeof v === 'object');
    if (validViolations.length === 0) {
      throw new Error('No valid violations found in response');
    }
    
    logger.debug(`Successfully extracted ${validViolations.length} violations from JSON`);
    return validViolations;
    
  } catch (error) {
    logger.error(`JSON parse error: ${error.message}`, { 
      jsonText: jsonText ? jsonText.substring(0, 200) + '...' : 'null',
      contentPreview: content.substring(0, 200) + '...'
    });
    throw new Error(`Failed to parse JSON from Claude response: ${error.message}`);
  }
}

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
      const violations = extractViolationsJson(content);
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

      // Check for rate limiting specifically
      if (error.response?.status === 400 && error.response?.data?.error?.type === 'invalid_request_error') {
        const rateLimitError = new Error('Claude API rate limit exceeded. Processing will resume when quota resets.');
        rateLimitError.isRateLimit = true;
        rateLimitError.originalError = error;
        rateLimitError.responseData = error.response?.data;
        rateLimitError.responseStatus = error.response?.status;
        throw rateLimitError;
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
   * @returns {Promise<Object>} - Object containing valid and invalid violations
   */
  async validateViolations(violations) {
    // Use the model's batch validation method
    const Violation = require('../models/Violation');
    return await Violation.validateBatch(violations, { requiresGeocoding: false });
  }
}

const claudeParserService = new ClaudeParserService();
claudeParserService.extractViolationsJson = extractViolationsJson;

module.exports = claudeParserService;