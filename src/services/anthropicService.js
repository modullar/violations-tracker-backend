const Anthropic = require('@anthropic-ai/sdk');
const config = require('../config/config');
const logger = require('../config/logger');

/**
 * AnthropicService class for handling Claude API interactions
 */
class AnthropicService {
  constructor() {
    this.client = new Anthropic({
      apiKey: config.anthropicApiKey || process.env.ANTHROPIC_API_KEY
    });
    this.model = config.anthropicModel || process.env.ANTHROPIC_MODEL || 'claude-3-7-sonnet-20250219';
    this.maxTokens = parseInt(config.anthropicMaxTokens || process.env.ANTHROPIC_MAX_TOKENS || 100000);
    this.timeout = parseInt(config.anthropicTimeout || process.env.ANTHROPIC_TIMEOUT || 300000);
  }

  /**
   * Parse a text report into structured violation objects
   * @param {string} text - The report text to parse
   * @param {string} language - Primary language of the report ('en' or 'ar')
   * @param {string} systemPrompt - The system prompt to use
   * @returns {Promise<Object>} Parsed violation data
   */
  async parseViolationReport(text, language = 'en', systemPrompt) {
    try {
      logger.info('Parsing violation report with Claude API');
      
      // Construct message based on language
      const message = this._constructMessage(text, language);
      
      // Call Claude API
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: this.maxTokens,
        system: systemPrompt,
        messages: [
          { role: 'user', content: message }
        ],
        temperature: 0.2, // Low temperature for more consistent, factual responses
      });

      // Process and validate the response
      return this._processResponse(response);
    } catch (error) {
      logger.error('Error parsing violation report:', error);
      throw new Error(`Failed to parse report: ${error.message}`);
    }
  }

  /**
   * Check if a violation may be a duplicate of existing records
   * @param {Object} newViolation - The new violation object
   * @param {Array<Object>} potentialDuplicates - Array of potential duplicate violations
   * @param {string} systemPrompt - The system prompt to use for duplicate detection
   * @returns {Promise<Object>} Duplicate analysis results
   */
  async detectDuplicates(newViolation, potentialDuplicates, systemPrompt) {
    try {
      logger.info(`Checking for duplicates among ${potentialDuplicates.length} potential matches`);
      
      const message = JSON.stringify({
        newViolation,
        potentialDuplicates
      }, null, 2);

      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: this.maxTokens,
        system: systemPrompt,
        messages: [
          { role: 'user', content: message }
        ],
        temperature: 0.2,
      });

      return this._processResponse(response);
    } catch (error) {
      logger.error('Error detecting duplicates:', error);
      throw new Error(`Failed to detect duplicates: ${error.message}`);
    }
  }

  /**
   * Translate text between English and Arabic
   * @param {string} text - Text to translate
   * @param {string} targetLanguage - Target language ('en' or 'ar')
   * @returns {Promise<string>} Translated text
   */
  async translateText(text, targetLanguage) {
    try {
      logger.info(`Translating text to ${targetLanguage}`);
      
      const systemPrompt = `You are a professional translator specializing in human rights documentation. 
      Translate the provided text into ${targetLanguage === 'ar' ? 'Arabic' : 'English'} 
      while preserving the meaning, tone, and factual information.`;

      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: this.maxTokens,
        system: systemPrompt,
        messages: [
          { role: 'user', content: text }
        ],
        temperature: 0.2,
      });

      // Extract translated text from response
      return response.content[0].text;
    } catch (error) {
      logger.error('Error translating text:', error);
      throw new Error(`Failed to translate text: ${error.message}`);
    }
  }

  /**
   * Construct message for the Claude API based on language
   * @private
   * @param {string} text - The report text
   * @param {string} language - Primary language ('en' or 'ar')
   * @returns {string} Formatted message
   */
  _constructMessage(text, language) {
    const languageLabel = language === 'ar' ? 'Arabic' : 'English';
    return `
# ${languageLabel} Human Rights Violation Report

${text}

---

Please parse this report and extract structured information according to the provided guidelines.
`;
  }

  /**
   * Process and validate the Claude API response
   * @private
   * @param {Object} response - The Claude API response
   * @returns {Object} Processed data
   */
  _processResponse(response) {
    if (!response || !response.content || response.content.length === 0) {
      throw new Error('Empty response from Claude API');
    }

    const contentText = response.content[0].text;
    
    try {
      // Extract JSON from the response
      const jsonMatch = contentText.match(/```json\n([\s\S]*?)\n```/) || 
                       contentText.match(/```\n([\s\S]*?)\n```/) ||
                       contentText.match(/{[\s\S]*}/);
      
      if (jsonMatch) {
        // Parse the JSON
        const jsonContent = jsonMatch[0].replace(/```json\n|```\n|```/g, '');
        return JSON.parse(jsonContent);
      } else {
        // If no JSON format found, try to parse the whole response
        return JSON.parse(contentText);
      }
    } catch (error) {
      logger.error('Failed to parse Claude response as JSON:', error);
      throw new Error('Invalid response format from Claude API');
    }
  }

  /**
   * Validate the model is available and credentials are working
   * @returns {Promise<boolean>} True if successful
   */
  async validateConnection() {
    try {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 50,
        messages: [
          { role: 'user', content: 'Test connection. Respond with: CONNECTION_SUCCESSFUL' }
        ]
      });
      
      return response.content[0].text.includes('CONNECTION_SUCCESSFUL');
    } catch (error) {
      logger.error('Failed to connect to Claude API:', error);
      return false;
    }
  }
}

module.exports = new AnthropicService();