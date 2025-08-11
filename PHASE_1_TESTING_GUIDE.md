# Phase 1 Batch Processing Testing Guide

## 1. Environment Setup Verification

First, ensure your environment variables are configured correctly:

### Check Your Environment File

Add these variables to your `.env.development` file:
```bash
# Enable batch processing
CLAUDE_BATCH_ENABLED=true
CLAUDE_BATCH_SIZE=8
CLAUDE_BATCH_TIMEOUT=180000

# Make sure Claude API is configured
CLAUDE_API_KEY=your_actual_claude_api_key_here
```

### Verify Configuration Loading

Check if the configuration is loaded correctly by looking at startup logs:
```bash
npm run dev
```

Look for logs indicating batch processing configuration.

## 2. Manual Testing Methods

### Method 1: Check System Logs

The batch processing system logs detailed information. Start your application and watch for these log messages:

**Batch Processing Enabled:**
```
[timestamp] info: Using batch processing approach
[timestamp] info: Created X batches for processing { batchSize: 8, totalReports: 15 }
[timestamp] info: Processing batch 1 with 8 reports
[timestamp] info: Batch processing completed for X reports
```

**Fallback to Individual Processing:**
```
[timestamp] info: Using individual processing approach (batch processing disabled or too few reports)
```

### Method 2: Database Monitoring

Monitor your MongoDB database for batch processing activity:

```javascript
// Connect to your MongoDB and run these queries

// Check reports ready for processing
db.reports.find({
  status: { $in: ['unprocessed', 'retry_pending'] },
  parsedByLLM: false
}).count()

// Monitor report processing status changes
db.reports.find({
  'processing_metadata.last_attempt': { $exists: true }
}).sort({ 'processing_metadata.last_attempt': -1 }).limit(10)

// Check recently created violations
db.violations.find({
  createdAt: { $gte: new Date(Date.now() - 3600000) } // Last hour
}).count()
```

### Method 3: API Testing

Use the existing API endpoints to trigger processing:

```bash
# Check reports ready for processing
curl -X GET "http://localhost:5000/api/reports/ready-for-processing?limit=15" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Check job processing status (if you have any parsing jobs)
curl -X GET "http://localhost:5000/api/reports/jobs/YOUR_JOB_ID" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

## 3. Detailed Log Analysis

### Enable Debug Logging

Set your log level to debug to see detailed batch processing information:

```bash
# In your environment file
LOG_LEVEL=debug
```

### Key Log Messages to Look For

**Successful Batch Processing:**
```
info: Attempting batch processing for X reports
info: Processing batch of X reports
info: Batch processing completed successfully
info: Batch processing completed for X reports { successfulReports: X, failedReports: 0 }
```

**Batch Fallback Scenarios:**
```
warn: Batch processing not viable, falling back to individual processing
error: Batch parsing failed, falling back to individual processing
warn: Batch result failed for report X, falling back to individual processing
```

**Performance Indicators:**
```
info: Batch 1 completed { reportsInBatch: 8, successfulReports: 8, violationsCreated: 25 }
```

## 4. Performance Verification

### Compare Processing Times

**Before Batch Processing (Individual):**
- 15 reports = 15 Claude API calls
- Expected time: ~60-90 seconds
- Token usage: ~30,000+ tokens

**With Batch Processing:**
- 15 reports = 2-3 Claude API calls  
- Expected time: ~20-30 seconds
- Token usage: ~12,000-15,000 tokens

### Monitor API Call Reduction

Check your Claude API usage dashboard to see the reduction in API calls.

## 5. Test Scenarios

### Scenario 1: Normal Batch Processing
```bash
# Ensure you have 10+ unprocessed reports in your database
# Start the application with batch processing enabled
# Wait for the next 10-minute cycle or trigger manually
# Check logs for batch processing messages
```

### Scenario 2: Fallback Testing
```bash
# Temporarily disable batch processing
CLAUDE_BATCH_ENABLED=false

# Or reduce batch size to test edge cases  
CLAUDE_BATCH_SIZE=2

# Verify it falls back to individual processing
```

### Scenario 3: Error Handling
```bash
# Test with invalid Claude API key to see fallback behavior
# Check if individual processing still works when batch fails
```

## 6. Quick Verification Commands

### Check if Batch Processing is Active

```bash
# Look for batch processing logs in the last 30 minutes
tail -f logs/combined.log | grep -i "batch"

# Or check specific log patterns
grep -i "batch processing" logs/combined.log | tail -10
```

### Monitor Real-time Processing

```bash
# Watch logs in real-time
tail -f logs/combined.log | grep -E "(batch|processing|violations created)"
```

### Database Query for Recent Activity

```javascript
// Check recent report processing activity
db.reports.aggregate([
  {
    $match: {
      'processing_metadata.last_attempt': {
        $gte: new Date(Date.now() - 1800000) // Last 30 minutes
      }
    }
  },
  {
    $group: {
      _id: '$status',
      count: { $sum: 1 }
    }
  }
])
```

## 7. Success Indicators

### ✅ Batch Processing is Working If You See:

1. **Log Messages:** "Using batch processing approach"
2. **Fewer API Calls:** Reduced Claude API usage in your dashboard
3. **Faster Processing:** Reports processed in larger groups
4. **Batch Completion Logs:** Success messages with batch statistics
5. **Normal Error Handling:** Fallback to individual processing when needed

### ❌ Issues to Watch For:

1. **Always Individual Processing:** Check environment variables
2. **No Processing at All:** Check Claude API key configuration  
3. **High Error Rates:** Monitor batch timeout settings
4. **Memory Issues:** Consider reducing batch size

## 8. Troubleshooting

### Common Issues:

**Issue:** Always using individual processing
**Solution:** Verify `CLAUDE_BATCH_ENABLED=true` and you have 3+ reports

**Issue:** Batch processing fails immediately  
**Solution:** Check Claude API key and network connectivity

**Issue:** Timeouts on large batches
**Solution:** Reduce `CLAUDE_BATCH_SIZE` or increase `CLAUDE_BATCH_TIMEOUT`

## 9. Performance Monitoring

Track these metrics to verify improvements:

- **API Calls Saved:** Should see 60-80% reduction
- **Token Usage:** Should see 40-60% reduction  
- **Processing Speed:** Should be 2-3x faster
- **Success Rate:** Should maintain same or better success rate

## Next Steps

Once you've verified Phase 1 is working correctly, you can:

1. **Monitor Performance:** Track the metrics over several days
2. **Optimize Batch Size:** Adjust based on your actual usage patterns
3. **Plan Phase 2:** Enhanced error handling and monitoring
4. **Scale Configuration:** Adjust settings for production loads 