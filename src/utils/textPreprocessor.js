const logger = require('../config/logger');

/**
 * Text preprocessing utility for Claude batch processing
 */
class TextPreprocessor {
  constructor() {
    this.minTextLength = parseInt(process.env.MIN_TEXT_LENGTH) || 50;
    this.maxTextLength = parseInt(process.env.MAX_TEXT_LENGTH) || 500000;
    this.violationKeywords = [
      'violation', 'killed', 'injured', 'wounded', 'attack', 'bomb', 'explosion',
      'airstrike', 'shelling', 'artillery', 'missile', 'rocket', 'sniper',
      'detention', 'arrest', 'torture', 'execution', 'civilian', 'casualties',
      'massacre', 'war crime', 'human rights', 'humanitarian', 'displacement',
      'refugee', 'evacuation', 'siege', 'blockade', 'chemical', 'weapon',
      'cluster', 'barrel bomb', 'white phosphorus', 'landmine', 'IED'
    ];
    this.lowConfidenceIndicators = [
      'rumor', 'unconfirmed', 'alleged', 'reportedly', 'claim', 'said to be',
      'according to unverified', 'not independently verified', 'social media claim'
    ];
  }

  /**
   * Determine if text should be processed with Claude
   * @param {string} text - Text to analyze
   * @returns {Object} - Processing decision with reason and confidence
   */
  shouldProcessWithClaude(text) {
    try {
      if (!text || typeof text !== 'string') {
        return {
          shouldProcess: false,
          reason: 'Invalid or empty text',
          confidence: 1.0
        };
      }

      const cleanText = text.trim();
      
      // Check minimum length
      if (cleanText.length < this.minTextLength) {
        return {
          shouldProcess: false,
          reason: `Text too short (${cleanText.length} chars, minimum: ${this.minTextLength})`,
          confidence: 0.9
        };
      }

      // Check maximum length
      if (cleanText.length > this.maxTextLength) {
        return {
          shouldProcess: false,
          reason: `Text too long (${cleanText.length} chars, maximum: ${this.maxTextLength})`,
          confidence: 0.9
        };
      }

      // Check for violation-related keywords
      const lowerText = cleanText.toLowerCase();
      const keywordMatches = this.violationKeywords.filter(keyword => 
        lowerText.includes(keyword.toLowerCase())
      );

      if (keywordMatches.length === 0) {
        return {
          shouldProcess: false,
          reason: 'No violation-related keywords found',
          confidence: 0.7,
          analysis: {
            textLength: cleanText.length,
            keywordMatches: []
          }
        };
      }

      // Check for low confidence indicators
      const lowConfidenceMatches = this.lowConfidenceIndicators.filter(indicator =>
        lowerText.includes(indicator.toLowerCase())
      );

      // Calculate confidence score
      let confidence = 0.8; // Base confidence
      
      // Boost confidence for multiple keyword matches
      if (keywordMatches.length > 3) {
        confidence += 0.1;
      }
      
      // Reduce confidence for low confidence indicators
      if (lowConfidenceMatches.length > 0) {
        confidence -= (lowConfidenceMatches.length * 0.1);
      }

      // Boost confidence for specific high-value keywords
      const highValueKeywords = ['killed', 'injured', 'airstrike', 'shelling', 'civilian'];
      const highValueMatches = highValueKeywords.filter(keyword =>
        lowerText.includes(keyword.toLowerCase())
      );
      
      if (highValueMatches.length > 0) {
        confidence += 0.1;
      }

      // Ensure confidence is between 0 and 1
      confidence = Math.max(0, Math.min(1, confidence));

      // Minimum confidence threshold
      const minConfidence = 0.6;
      if (confidence < minConfidence) {
        return {
          shouldProcess: false,
          reason: `Low confidence score (${confidence.toFixed(2)}, minimum: ${minConfidence})`,
          confidence,
          analysis: {
            textLength: cleanText.length,
            keywordMatches,
            lowConfidenceMatches,
            highValueMatches
          }
        };
      }

      return {
        shouldProcess: true,
        reason: `Text meets processing criteria (${keywordMatches.length} keywords, confidence: ${confidence.toFixed(2)})`,
        confidence,
        analysis: {
          textLength: cleanText.length,
          keywordMatches,
          lowConfidenceMatches,
          highValueMatches
        }
      };

    } catch (error) {
      logger.error('Error in text preprocessing:', error);
      return {
        shouldProcess: false,
        reason: `Preprocessing error: ${error.message}`,
        confidence: 0.0,
        error: error.message
      };
    }
  }

  /**
   * Get preprocessing statistics for a batch of texts
   * @param {Array<string>} texts - Array of texts to analyze
   * @returns {Object} - Statistics about the batch
   */
  getBatchStats(texts) {
    if (!Array.isArray(texts)) {
      throw new Error('texts must be an array');
    }

    const results = texts.map(text => this.shouldProcessWithClaude(text));
    const shouldProcess = results.filter(r => r.shouldProcess);
    const avgConfidence = results.reduce((sum, r) => sum + r.confidence, 0) / results.length;
    
    return {
      totalTexts: texts.length,
      shouldProcess: shouldProcess.length,
      shouldSkip: results.length - shouldProcess.length,
      processingRate: shouldProcess.length / texts.length,
      averageConfidence: avgConfidence,
      averageLength: texts.reduce((sum, text) => sum + (text?.length || 0), 0) / texts.length
    };
  }

  /**
   * Update configuration
   * @param {Object} config - New configuration options
   */
  updateConfig(config) {
    if (config.minTextLength !== undefined) {
      this.minTextLength = config.minTextLength;
    }
    if (config.maxTextLength !== undefined) {
      this.maxTextLength = config.maxTextLength;
    }
    if (config.violationKeywords !== undefined) {
      this.violationKeywords = config.violationKeywords;
    }
    if (config.lowConfidenceIndicators !== undefined) {
      this.lowConfidenceIndicators = config.lowConfidenceIndicators;
    }
    
    logger.info('Text preprocessor configuration updated', {
      minTextLength: this.minTextLength,
      maxTextLength: this.maxTextLength,
      violationKeywords: this.violationKeywords.length,
      lowConfidenceIndicators: this.lowConfidenceIndicators.length
    });
  }

  /**
   * Get current configuration
   * @returns {Object} - Current configuration
   */
  getConfig() {
    return {
      minTextLength: this.minTextLength,
      maxTextLength: this.maxTextLength,
      violationKeywords: this.violationKeywords.slice(),
      lowConfidenceIndicators: this.lowConfidenceIndicators.slice()
    };
  }
}

module.exports = new TextPreprocessor();