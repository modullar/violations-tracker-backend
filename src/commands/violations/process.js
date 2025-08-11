const claudeParser = require('../../services/claudeParser');
const claudeBatchParser = require('../../services/claudeBatchParser');
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
      // Handle rate limiting specifically
      if (error.isRateLimit) {
        const errorMessage = 'Claude API rate limit exceeded. Processing will resume when quota resets.';
        logger.warn(`Rate limit hit for report ${report._id}: ${errorMessage}`);
        
        // Don't mark as failed for rate limiting - just return with error
        return {
          success: false,
          reportId: report._id,
          violationsCreated: 0,
          error: errorMessage,
          isRateLimit: true,
          processingTimeMs: Date.now() - startTime
        };
      }
      
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
    logger.debug(`Starting validation for ${parsedViolations.length} violations in report ${report._id}`);
    const validationResult = await claudeParser.validateViolations(parsedViolations);
    
    // Ensure validationResult has the expected structure
    if (!validationResult || typeof validationResult !== 'object') {
      const errorMessage = 'Validation returned invalid result structure';
      logger.error(`Validation error for report ${report._id}: ${errorMessage}`, validationResult);
      
      await report.markAsFailed(errorMessage);
      
      return {
        success: false,
        reportId: report._id,
        violationsCreated: 0,
        error: errorMessage,
        processingTimeMs: Date.now() - startTime
      };
    }
    
    const { valid = [], invalid = [] } = validationResult;
    
    logger.debug(`Validation completed for report ${report._id}: ${valid.length} valid, ${invalid.length} invalid violations`);
    
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

/**
 * Process a single report without marking as processing (for fallback scenarios)
 * @param {Object} report - Report document from MongoDB
 * @returns {Promise<Object>} - Processing result
 */
const processReportWithoutMarking = async (report) => {
  const startTime = Date.now();
  
  try {
    logger.info(`Processing report ${report._id} from channel ${report.metadata.channel} (without re-marking as processing)`);
    
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
    logger.debug(`Starting validation for ${parsedViolations.length} violations in report ${report._id}`);
    const validationResult = await claudeParser.validateViolations(parsedViolations);
    
    // Ensure validationResult has the expected structure
    if (!validationResult || typeof validationResult !== 'object') {
      const errorMessage = 'Validation returned invalid result structure';
      logger.error(`Validation error for report ${report._id}: ${errorMessage}`, validationResult);
      
      await report.markAsFailed(errorMessage);
      
      return {
        success: false,
        reportId: report._id,
        violationsCreated: 0,
        error: errorMessage,
        processingTimeMs: Date.now() - startTime
      };
    }
    
    const { valid = [], invalid = [] } = validationResult;
    
    logger.debug(`Validation completed for report ${report._id}: ${valid.length} valid, ${invalid.length} invalid violations`);
    
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

/**
 * Process multiple reports as a batch using Claude API
 * @param {Array} reports - Array of report objects
 * @returns {Promise<Array>} - Array of processing results
 */
const processReportsBatch = async (reports) => {
  const startTime = Date.now();
  
  try {
    if (!reports || reports.length === 0) {
      return [];
    }

    logger.info(`Attempting batch processing for ${reports.length} reports`, {
      reportIds: reports.map(r => r._id.toString())
    });
    
    // Check if batch processing should be used
    if (!claudeBatchParser.shouldUseBatchProcessing(reports)) {
      logger.info('Batch processing not viable, falling back to individual processing');
      return await processReportsIndividually(reports);
    }
    
    // Mark all reports as processing
    await Promise.all(reports.map(report => report.markAsProcessing()));
    
    // Attempt batch parsing with Claude API
    let batchResults;
    try {
      batchResults = await claudeBatchParser.parseReportsBatch(reports);
      logger.info(`Batch parsing completed for ${reports.length} reports`);
    } catch (error) {
      logger.error('Batch parsing failed, falling back to individual processing:', error);
      return await processReportsIndividually(reports);
    }

    // Process each report's results
    const results = [];
    for (let i = 0; i < reports.length; i++) {
      const report = reports[i];
      const reportKey = `report_${i + 1}`;
      const reportResult = batchResults[reportKey];
      
      if (reportResult && reportResult.success && Array.isArray(reportResult.violations)) {
        // Handle successful batch result
        try {
          const result = await handleSuccessfulBatchResult(report, reportResult.violations);
          results.push(result);
          logger.debug(`Successfully processed report ${report._id} from batch`);
        } catch (error) {
          logger.error(`Failed to process batch result for report ${report._id}:`, error);
          
          // Fallback to individual processing for this report (without re-marking as processing)
          const fallbackResult = await processReportWithoutMarking(report);
          results.push(fallbackResult);
        }
      } else {
        // Fallback to individual processing for this report (without re-marking as processing)
        logger.warn(`Batch result failed for report ${report._id}, falling back to individual processing`);
        const result = await processReportWithoutMarking(report);
        results.push(result);
      }
    }
    
    const totalProcessingTime = Date.now() - startTime;
    logger.info(`Batch processing completed for ${reports.length} reports`, {
      successfulReports: results.filter(r => r.success).length,
      failedReports: results.filter(r => !r.success).length,
      totalProcessingTimeMs: totalProcessingTime
    });
    
    return results;
    
  } catch (error) {
    logger.error('Batch processing failed completely, falling back to individual processing:', error);
    
    // Complete fallback: process all reports individually (without re-marking as processing)
    return await processReportsIndividuallyWithoutMarking(reports);
  }
};

/**
 * Handle successful batch parsing result for a single report
 * @param {Object} report - Report document from MongoDB
 * @param {Array} parsedViolations - Array of parsed violations from batch result
 * @returns {Promise<Object>} - Processing result
 */
const handleSuccessfulBatchResult = async (report, parsedViolations) => {
  const startTime = Date.now();
  
  try {
    logger.debug(`Processing batch result for report ${report._id}: ${parsedViolations.length} violations`);
    
    // If no violations found, mark as ignored
    if (!parsedViolations || parsedViolations.length === 0) {
      const reason = 'No violations found in report after batch Claude parsing';
      logger.info(`No violations found for report ${report._id} in batch processing`);
      
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

    // Validate violations using the Claude parser's validation
    logger.debug(`Starting validation for ${parsedViolations.length} violations from batch result for report ${report._id}`);
    const validationResult = await claudeParser.validateViolations(parsedViolations);
    
    if (!validationResult || typeof validationResult !== 'object') {
      const errorMessage = 'Batch validation returned invalid result structure';
      logger.error(`Validation error for report ${report._id}: ${errorMessage}`, validationResult);
      
      await report.markAsFailed(errorMessage);
      
      return {
        success: false,
        reportId: report._id,
        violationsCreated: 0,
        error: errorMessage,
        processingTimeMs: Date.now() - startTime
      };
    }
    
    const { valid = [], invalid = [] } = validationResult;
    
    logger.debug(`Batch validation completed for report ${report._id}: ${valid.length} valid, ${invalid.length} invalid violations`);
    
    if (valid.length === 0) {
      const errorMessage = `All ${parsedViolations.length} batch-parsed violations failed validation`;
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
    logger.info(`Creating ${valid.length} violations for report ${report._id} from batch processing (${invalid.length} failed validation)`);
    
    const creationResult = await createViolationsFromReport(report, valid);
    
    if (creationResult.violationsCreated === 0) {
      const errorMessage = 'Failed to create any violations from batch-parsed data';
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
    
    logger.info(`Successfully processed report ${report._id} from batch:`, {
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
      processingTimeMs
    };
    
  } catch (error) {
    const errorMessage = `Batch result processing failed: ${error.message}`;
    logger.error(`Error processing batch result for report ${report._id}:`, error);
    
    await report.markAsFailed(errorMessage);
    
    return {
      success: false,
      reportId: report._id,
      violationsCreated: 0,
      error: errorMessage,
      processingTimeMs: Date.now() - startTime
    };
  }
};

/**
 * Process reports individually (fallback method)
 * @param {Array} reports - Array of report objects
 * @returns {Promise<Array>} - Array of processing results
 */
const processReportsIndividually = async (reports) => {
  logger.info(`Processing ${reports.length} reports individually`);
  
  const results = [];
  for (const report of reports) {
    try {
      const result = await processReport(report);
      results.push(result);
    } catch (error) {
      logger.error(`Failed to process report ${report._id} individually:`, error);
      results.push({
        success: false,
        reportId: report._id,
        violationsCreated: 0,
        error: error.message,
        processingTimeMs: 0
      });
    }
  }
  
  return results;
};

/**
 * Process reports individually (fallback method)
 * @param {Array} reports - Array of report objects
 * @returns {Promise<Array>} - Array of processing results
 */
const processReportsIndividuallyWithoutMarking = async (reports) => {
  logger.info(`Processing ${reports.length} reports individually (without re-marking as processing)`);
  
  const results = [];
  for (const report of reports) {
    try {
      const result = await processReportWithoutMarking(report);
      results.push(result);
    } catch (error) {
      logger.error(`Failed to process report ${report._id} individually (without re-marking as processing):`, error);
      results.push({
        success: false,
        reportId: report._id,
        violationsCreated: 0,
        error: error.message,
        processingTimeMs: 0
      });
    }
  }
  
  return results;
};

module.exports = {
  processReport,
  processReportsBatch,        // New batch processing function
  createViolationsFromReport,
  handleSuccessfulBatchResult, // New helper function
  processReportsIndividually,   // New fallback function
  processReportsIndividuallyWithoutMarking, // New fallback function without marking
  processReportWithoutMarking  // New function for fallback processing without marking
};