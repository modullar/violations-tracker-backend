const claudeParser = require('../../services/claudeParser');
const { createSingleViolation } = require('./create');
const logger = require('../../config/logger');

/**
 * Create violations from a report using Claude API parsing
 * @param {Object} report - Report document from MongoDB
 * @param {Array} parsedViolations - Array of parsed violation data from Claude
 * @returns {Promise<Object>} - Result object with created violations
 */
const createViolationsFromReport = async (report, parsedViolations) => {
  if (!Array.isArray(parsedViolations) || parsedViolations.length === 0) {
    return {
      violationsCreated: 0,
      violationIds: [],
      errors: ['No valid violations to create']
    };
  }

  const createdViolations = [];
  const errors = [];
  
  for (let i = 0; i < parsedViolations.length; i++) {
    const violationData = parsedViolations[i];
    
    try {
      // Add source information from the report
      if (!violationData.source) {
        violationData.source = { en: '', ar: '' };
      }
      
      // Add report URL as source
      if (report.source_url) {
        violationData.source.en = `${violationData.source.en ? violationData.source.en + '. ' : ''}Telegram: ${report.metadata.channel}`;
        violationData.source_url = { 
          en: report.source_url, 
          ar: report.source_url 
        };
      }
      
      // Set reported date to report's date if not provided
      if (!violationData.reported_date && report.date) {
        violationData.reported_date = report.date;
      }

      // Create violation with duplicate checking enabled
      const result = await createSingleViolation(violationData, null, {
        checkDuplicates: true,
        mergeDuplicates: true,
        duplicateThreshold: 0.85 // Higher threshold for LLM-parsed content
      });

      // Link violation to report
      if (result.violation && result.violation._id) {
        await result.violation.linkToReport(report._id);
        createdViolations.push(result.violation._id);
        
        if (result.wasMerged) {
          logger.info(`Violation merged with existing violation for report ${report._id}`, {
            newViolationData: violationData.description?.en?.substring(0, 100) + '...',
            mergedWithId: result.duplicateInfo.originalId,
            similarity: result.duplicateInfo.similarity,
            exactMatch: result.duplicateInfo.exactMatch
          });
        } else {
          logger.info(`New violation created for report ${report._id}`, {
            violationId: result.violation._id,
            type: result.violation.type,
            location: result.violation.location?.name?.en
          });
        }
      }
      
    } catch (error) {
      logger.error(`Failed to create violation ${i + 1} for report ${report._id}:`, error);
      errors.push({
        violationIndex: i,
        violationData: violationData,
        error: error.message
      });
    }
  }

  return {
    violationsCreated: createdViolations.length,
    violationIds: createdViolations,
    errors: errors.length > 0 ? errors : undefined
  };
};

/**
 * Process a single report: parse with Claude API and create violations
 * @param {Object} report - Report document from MongoDB
 * @returns {Promise<Object>} - Processing result
 */
const processReport = async (report) => {
  const startTime = Date.now();
  
  try {
    // Mark report as processing
    await report.markAsProcessing();
    
    logger.info(`Processing report ${report._id} from channel ${report.metadata.channel}`);
    
    // Parse the report with Claude API
    let parsedViolations;
    try {
      // Verify Claude API key is configured
      if (!process.env.CLAUDE_API_KEY) {
        throw new Error('Claude API key is not configured. Please check your environment variables.');
      }
      
      logger.debug(`Calling Claude API for report ${report._id} with text length: ${report.text.length} characters`);
      
      // Call Claude API to parse the report
      const sourceURL = {
        name: `Telegram - ${report.metadata.channel}`,
        url: report.source_url,
        reportDate: report.date.toISOString().split('T')[0]
      };
      
      parsedViolations = await claudeParser.parseReport(report.text, sourceURL);
      
      logger.debug(`Claude parsing completed for report ${report._id}, found ${parsedViolations?.length || 0} potential violations`);
      
    } catch (error) {
      const errorMessage = `Claude parsing failed: ${error.message}`;
      logger.error(`Claude parsing error for report ${report._id}:`, error);
      
      await report.markAsFailed(errorMessage);
      
      return {
        success: false,
        reportId: report._id,
        violationsCreated: 0,
        error: errorMessage,
        processingTimeMs: Date.now() - startTime
      };
    }

    // Validate the parsed violations
    if (!parsedViolations || !Array.isArray(parsedViolations)) {
      const errorMessage = 'Claude API returned invalid data format';
      logger.error(`Validation error for report ${report._id}: ${errorMessage}`);
      
      await report.markAsFailed(errorMessage);
      
      return {
        success: false,
        reportId: report._id,
        violationsCreated: 0,
        error: errorMessage,
        processingTimeMs: Date.now() - startTime
      };
    }

    // If no violations found, mark as ignored
    if (parsedViolations.length === 0) {
      const reason = 'No violations found in report after Claude parsing';
      logger.info(`No violations found for report ${report._id}`);
      
      await report.markAsIgnored(reason);
      
      return {
        success: true,
        reportId: report._id,
        violationsCreated: 0,
        ignored: true,
        reason: reason,
        processingTimeMs: Date.now() - startTime
      };
    }

    // Validate violations using the model's validation
    const { valid, invalid } = claudeParser.validateViolations(parsedViolations);
    
    if (valid.length === 0) {
      const errorMessage = `All ${parsedViolations.length} parsed violations failed validation`;
      logger.error(`All violations invalid for report ${report._id}:`, { 
        invalidCount: invalid.length,
        errors: invalid.map(inv => inv.errors).flat()
      });
      
      await report.markAsFailed(errorMessage);
      
      return {
        success: false,
        reportId: report._id,
        violationsCreated: 0,
        error: errorMessage,
        validationErrors: invalid,
        processingTimeMs: Date.now() - startTime
      };
    }

    // Create violations in the database
    logger.info(`Creating ${valid.length} violations for report ${report._id} (${invalid.length} failed validation)`);
    
    const creationResult = await createViolationsFromReport(report, valid);
    
    if (creationResult.violationsCreated === 0) {
      const errorMessage = 'Failed to create any violations from parsed data';
      logger.error(`No violations created for report ${report._id}:`, creationResult.errors);
      
      await report.markAsFailed(errorMessage);
      
      return {
        success: false,
        reportId: report._id,
        violationsCreated: 0,
        error: errorMessage,
        creationErrors: creationResult.errors,
        processingTimeMs: Date.now() - startTime
      };
    }

    // Mark report as successfully processed
    const processingTimeMs = Date.now() - startTime;
    await report.markAsProcessed(creationResult.violationIds, processingTimeMs);
    
    logger.info(`Successfully processed report ${report._id}:`, {
      violationsCreated: creationResult.violationsCreated,
      totalParsed: parsedViolations.length,
      validViolations: valid.length,
      invalidViolations: invalid.length,
      processingTimeMs
    });

    return {
      success: true,
      reportId: report._id,
      violationsCreated: creationResult.violationsCreated,
      violationIds: creationResult.violationIds,
      totalParsed: parsedViolations.length,
      validViolations: valid.length,
      invalidViolations: invalid.length,
      validationErrors: invalid.length > 0 ? invalid : undefined,
      creationErrors: creationResult.errors,
      processingTimeMs
    };

  } catch (error) {
    const processingTimeMs = Date.now() - startTime;
    const errorMessage = `Unexpected error during report processing: ${error.message}`;
    
    logger.error(`Unexpected error processing report ${report._id}:`, error);
    
    try {
      await report.markAsFailed(errorMessage);
    } catch (updateError) {
      logger.error(`Failed to update report status after error: ${updateError.message}`);
    }
    
    return {
      success: false,
      reportId: report._id,
      violationsCreated: 0,
      error: errorMessage,
      processingTimeMs
    };
  }
};

module.exports = {
  processReport,
  createViolationsFromReport
};