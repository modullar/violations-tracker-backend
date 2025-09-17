# Batch Processing Environment Configuration

## Phase 1 Implementation Complete

Phase 1 of the batch processing system has been successfully implemented. To enable batch processing, add these environment variables to your `.env.development`, `.env.staging`, or `.env.production` files:

## Required Environment Variables

### Core Batch Processing Configuration

```bash
# Enable/disable batch processing (default: true)
CLAUDE_BATCH_ENABLED=true

# Number of reports to process in a single batch (default: 8)
# Recommended values:
# - Development: 8
# - Staging: 6  
# - Production: 10
CLAUDE_BATCH_SIZE=8

# Timeout for batch processing in milliseconds (default: 180000 = 3 minutes)
CLAUDE_BATCH_TIMEOUT=180000
```

### Existing Claude API Configuration (Required)

```bash
CLAUDE_API_KEY=your_claude_api_key_here
CLAUDE_API_ENDPOINT=https://api.anthropic.com/v1/messages
CLAUDE_MODEL=claude-3-5-sonnet-20240620
CLAUDE_MAX_TOKENS=4096
```

## Environment-Specific Recommendations

### Development Environment (.env.development)
```bash
CLAUDE_BATCH_ENABLED=true
CLAUDE_BATCH_SIZE=8
CLAUDE_BATCH_TIMEOUT=180000
```

### Staging Environment (.env.staging)
```bash
CLAUDE_BATCH_ENABLED=true
CLAUDE_BATCH_SIZE=6
CLAUDE_BATCH_TIMEOUT=180000
```

### Production Environment (.env.production)
```bash
CLAUDE_BATCH_ENABLED=true
CLAUDE_BATCH_SIZE=10
CLAUDE_BATCH_TIMEOUT=180000
```

## How Batch Processing Works

1. **Automatic Detection**: The system automatically detects if batch processing should be used based on:
   - `CLAUDE_BATCH_ENABLED=true`
   - Claude API key is configured
   - At least 3 reports are available for processing

2. **Batch Creation**: Reports are grouped into batches of `CLAUDE_BATCH_SIZE` (default: 8)

3. **Concurrent Processing**: Up to 3 batches are processed concurrently

4. **Fallback Mechanism**: If batch processing fails, the system automatically falls back to individual processing

## Expected Benefits

- **60-80% reduction** in Claude API calls
- **40-60% reduction** in token usage  
- **2-3x faster** processing cycles
- **Full backward compatibility**

## Disabling Batch Processing

To disable batch processing and use the original individual processing method:

```bash
CLAUDE_BATCH_ENABLED=false
```

Or simply omit the batch processing environment variables entirely.

## Monitoring

The system will log batch processing activities:

- Batch creation and processing
- Fallback to individual processing when needed
- Performance metrics and success rates

Check your application logs for batch processing status and performance information. 