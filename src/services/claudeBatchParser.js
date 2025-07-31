const axios = require('axios');
const logger = require('../config/logger');
const parseInstructions = require('../config/parseInstructions');

/**
 * Claude Batch Parser Service
 * Processes multiple reports in a single Claude API call for improved efficiency
 */
class ClaudeBatchParser {
  constructor() {
    this.apiKey = process.env.CLAUDE_API_KEY;
    this.apiEndpoint = process.env.CLAUDE_API_ENDPOINT || 'https://api.anthropic.com/v1/messages';
    this.model = process.env.CLAUDE_MODEL || 'claude-3-5-sonnet-20240620';
    this.maxTokens = parseInt(process.env.CLAUDE_MAX_TOKENS) || 4096;
    this.batchSize = parseInt(process.env.CLAUDE_BATCH_SIZE) || 8;
    this.batchTimeout = parseInt(process.env.CLAUDE_BATCH_TIMEOUT) || 180000; // 3 minutes
    this.enabled = process.env.CLAUDE_BATCH_ENABLED !== 'false';
  }

  /**
   * Process multiple reports in a single Claude API call
   * @param {Array} reports - Array of report objects
   * @returns {Promise<Object>} - Results mapped by report ID
   */
  async parseReportsBatch(reports) {
    if (!reports || reports.length === 0) {
      return {};
    }

    if (!this.enabled) {
      throw new Error('Batch processing is disabled');
    }

    // Limit batch size
    const batchReports = reports.slice(0, this.batchSize);
    
    logger.info(`Processing batch of ${batchReports.length} reports`, {
      reportIds: batchReports.map(r => r._id.toString()),
      batchSize: this.batchSize
    });
    
    try {
      if (!this.apiKey) {
        throw new Error('Claude API key is not configured');
      }

      const batchPrompt = this.buildBatchPrompt(batchReports);
      
      logger.debug('Sending batch request to Claude API', {
        promptLength: batchPrompt.length,
        reportsCount: batchReports.length
      });

      const response = await axios.post(
        this.apiEndpoint,
        {
          model: this.model,
          max_tokens: this.maxTokens,
          system: parseInstructions.SYSTEM_PROMPT,
          messages: [
            {
              role: 'user',
              content: batchPrompt
            }
          ]
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': this.apiKey,
            'anthropic-version': '2023-06-01'
          },
          timeout: this.batchTimeout
        }
      );

      const content = response.data.content[0].text;
      const results = this.parseBatchResponse(content, batchReports);
      
      logger.info(`Batch processing completed successfully`, {
        resultsCount: Object.keys(results).length,
        reportsProcessed: batchReports.length
      });
      
      return results;
      
    } catch (error) {
      logger.error('Batch processing failed:', {
        error: error.message,
        reportsCount: batchReports.length,
        reportIds: batchReports.map(r => r._id.toString())
      });
      
      // Enhanced error with original error details
      const enhancedError = new Error(`Batch processing failed: ${error.message}`);
      enhancedError.originalError = error;
      enhancedError.responseData = error.response?.data;
      enhancedError.responseStatus = error.response?.status;
      
      throw enhancedError;
    }
  }

  /**
   * Build batch prompt from multiple reports
   * @param {Array} reports - Report objects
   * @returns {String} - Formatted batch prompt
   */
  buildBatchPrompt(reports) {
    let reportsContent = '';
    
    reports.forEach((report, index) => {
      const sourceInfo = `Telegram - ${report.metadata.channel}`;
      const reportDate = report.date.toISOString().split('T')[0];
      
      reportsContent += parseInstructions.BATCH_REPORT_TEMPLATE
        .replace('{INDEX}', index + 1)
        .replace('{SOURCE_INFO}', sourceInfo)
        .replace('{REPORT_DATE}', reportDate)
        .replace('{REPORT_TEXT}', report.text);
    });

    const prompt = parseInstructions.BATCH_USER_PROMPT
      .replace('{REPORT_COUNT}', reports.length)
      .replace('{REPORTS_CONTENT}', reportsContent);

    logger.debug('Built batch prompt', {
      promptLength: prompt.length,
      reportsCount: reports.length
    });

    return prompt;
  }

  /**
   * Parse batch response back to individual report results
   * @param {String} content - Claude API response content
   * @param {Array} reports - Original reports array
   * @returns {Object} - Parsed results by report ID
   */
  parseBatchResponse(content, reports) {
    try {
      logger.debug('Parsing batch response', {
        contentLength: content.length,
        reportsCount: reports.length
      });

      // Extract JSON from response
      const jsonText = this.extractJsonFromResponse(content);
      const batchResults = JSON.parse(jsonText);
      
      // Validate that batchResults is an object
      if (typeof batchResults !== 'object' || batchResults === null || Array.isArray(batchResults)) {
        throw new Error('Batch response is not a valid object');
      }
      
      const results = {};
      
      // Map results back to reports
      reports.forEach((report, index) => {
        const reportKey = `report_${index + 1}`;
        const violations = batchResults[reportKey];
        
        if (violations === undefined) {
          logger.warn(`Missing result for ${reportKey} in batch response`);
          results[reportKey] = {
            success: false,
            error: `Missing result for ${reportKey}`,
            violations: [],
            reportId: report._id
          };
        } else if (Array.isArray(violations)) {
          results[reportKey] = {
            success: true,
            violations: violations,
            reportId: report._id
          };
          
          logger.debug(`Parsed ${violations.length} violations for ${reportKey}`);
        } else {
          logger.warn(`Invalid violations format for ${reportKey}:`, typeof violations);
          results[reportKey] = {
            success: false,
            error: `Invalid violations format: expected array, got ${typeof violations}`,
            violations: [],
            reportId: report._id
          };
        }
      });
      
      logger.info('Batch response parsed successfully', {
        resultsCount: Object.keys(results).length,
        successfulResults: Object.values(results).filter(r => r.success).length
      });
      
      return results;
      
    } catch (error) {
      logger.error('Failed to parse batch response:', {
        error: error.message,
        contentPreview: content.substring(0, 500) + '...'
      });
      throw new Error(`Failed to parse batch response: ${error.message}`);
    }
  }

  /**
   * Extract JSON object from Claude response content
   * @param {String} content - Claude API response content
   * @returns {String} - Extracted JSON text
   */
  extractJsonFromResponse(content) {
    logger.debug('Extracting JSON from response', { contentLength: content.length });
    
    let jsonText = null;
    
    // Pattern 1: JSON object in code block with json language specification
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
    
    // Pattern 4: Raw JSON object at the beginning or end
    if (!jsonText) {
      const trimmed = content.trim();
      if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
        jsonText = trimmed;
        logger.debug('Found raw JSON object');
      }
    }
    
    // Pattern 5: Look for JSON object anywhere in the content
    if (!jsonText) {
      const objectMatch = content.match(/\{[\s\S]*\}/);
      if (objectMatch) {
        jsonText = objectMatch[0];
        logger.debug('Found JSON object embedded in text');
      }
    }

    if (!jsonText) {
      logger.error('No JSON found in Claude batch response. Content preview:', content.substring(0, 500));
      throw new Error('Failed to extract JSON object from the batch response. Claude may have returned an explanation instead of JSON.');
    }

    return jsonText;
  }

  /**
   * Check if batch processing is enabled and viable for the given reports
   * @param {Array} reports - Array of report objects
   * @returns {Boolean} - Whether batch processing should be used
   */
  shouldUseBatchProcessing(reports) {
    if (!this.enabled) {
      return false;
    }

    if (!reports || reports.length < 3) {
      logger.debug('Too few reports for batch processing', { count: reports?.length || 0 });
      return false;
    }

    if (!this.apiKey) {
      logger.warn('Claude API key not configured, cannot use batch processing');
      return false;
    }

    return true;
  }
}

const claudeBatchParser = new ClaudeBatchParser();

module.exports = claudeBatchParser; 