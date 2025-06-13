# Duplicate Detection System

This document describes the duplicate detection and merging functionality implemented in the violations tracking system.

## Overview

The system automatically detects potential duplicate violations during creation and provides options to either create new violations or merge with existing ones. This helps maintain data quality and prevents duplicate entries.

## How It Works

### Detection Criteria

The system uses multiple criteria to identify potential duplicates:

1. **Exact Match Criteria** (all must match):
   - Same violation type
   - Same date
   - Same perpetrator affiliation
   - Location within 100 meters
   - Same casualty count

2. **Similarity Match Criteria**:
   - Description similarity ≥ 75% (using string similarity algorithm)

### Configuration

Key configuration constants in `src/utils/duplicateDetection.js`:

```javascript
const SIMILARITY_THRESHOLD = 0.75; // 75% similarity threshold
const MAX_DISTANCE_METERS = 100;   // 100 meters location tolerance
```

## API Usage

### Single Violation Creation

#### Create New Violation (Default)
```javascript
POST /api/violations
{
  "type": "AIRSTRIKE",
  "date": "2023-06-15",
  "location": {
    "name": { "en": "Aleppo", "ar": "حلب" },
    "coordinates": [36.2021, 37.1343]
  },
  "description": { "en": "Airstrike on residential area" },
  "source_urls": ["http://example.com/source1"],
  // ... other fields
}
```

#### Merge with Duplicates
```javascript
POST /api/violations
{
  "action": "merge",
  "type": "AIRSTRIKE",
  "date": "2023-06-15",
  "location": {
    "name": { "en": "Aleppo", "ar": "حلب" },
    "coordinates": [36.2021, 37.1343]
  },
  "description": { "en": "Airstrike on residential area" },
  "source_urls": ["http://example.com/source2"],
  // ... other fields
}
```

### Batch Violation Creation

#### Create Multiple Violations
```javascript
POST /api/violations/batch
{
  "action": "create",
  "violations": [
    {
      "type": "AIRSTRIKE",
      "date": "2023-06-15",
      // ... violation data
    },
    {
      "type": "SHELLING",
      "date": "2023-06-16",
      // ... violation data
    }
  ]
}
```

#### Batch with Merge Option
```javascript
POST /api/violations/batch
{
  "action": "merge",
  "violations": [
    // ... array of violations
  ]
}
```

## Response Format

### Single Violation Response

#### New Violation Created
```javascript
{
  "success": true,
  "message": "Violation created successfully",
  "data": {
    "violation": { /* violation object */ },
    "duplicates": [
      {
        "id": "existing_violation_id",
        "matchDetails": {
          "sameType": true,
          "sameDate": true,
          "similarity": 0.65,
          "distance": 50.5,
          "exactMatch": false,
          "similarityMatch": false
        }
      }
    ],
    "action": "created"
  }
}
```

#### Violation Merged
```javascript
{
  "success": true,
  "message": "Violation merged with existing duplicate",
  "data": {
    "violation": { /* updated violation object */ },
    "duplicates": [
      {
        "id": "merged_violation_id",
        "matchDetails": {
          "sameType": true,
          "sameDate": true,
          "similarity": 0.85,
          "distance": 25.3,
          "exactMatch": true,
          "similarityMatch": true
        }
      }
    ],
    "action": "merged"
  }
}
```

### Batch Response

```javascript
{
  "success": true,
  "message": "Batch processing completed: 2 created, 1 merged",
  "count": 3,
  "data": {
    "violations": [ /* array of violation objects */ ],
    "results": [
      {
        "violation": { /* violation object */ },
        "duplicates": [ /* duplicate info */ ],
        "action": "created",
        "index": 0
      },
      {
        "violation": { /* violation object */ },
        "duplicates": [ /* duplicate info */ ],
        "action": "merged",
        "index": 1
      }
    ],
    "summary": {
      "total": 3,
      "created": 2,
      "merged": 1
    }
  },
  "errors": [ /* any processing errors */ ]
}
```

## Data Merging

When violations are merged, the following data is combined:

### Arrays (Deduplicated)
- `source_urls`: All unique URLs from both violations
- `media_links`: All unique media links
- `tags`: Tags merged by English text (no duplicates)
- `victims`: Victims merged by age, gender, and status

### Fields (New Data Preferred)
- Most fields from the new violation override existing ones
- `verified`: Uses `true` if either violation is verified
- `updated_by`: Set to the user performing the merge
- `updatedAt`: Set to current timestamp

## Database Schema Changes

### New Field Added
```javascript
source_urls: {
  type: [String],
  default: [],
  validate: {
    validator: function(v) {
      if (!v) return true;
      return v.every(url => /^(https?:\/\/)?([a-z0-9.-]+)\.([a-z.]{2,6})([/\w .-]*)*\/?$/.test(url));
    },
    message: 'One or more source URLs are invalid'
  }
}
```

### Indexes for Performance
```javascript
// Recommended indexes for duplicate detection
ViolationSchema.index({ type: 1, date: 1, perpetrator_affiliation: 1 });
ViolationSchema.index({ 'location.coordinates': '2dsphere' });
```

## Validation

### Action Parameter
- Optional field in request body
- Valid values: `"create"` or `"merge"`
- Default: `"create"`

### Source URLs
- Array of valid URLs
- Automatically deduplicated during merge
- Validates URL format

## Testing

### Unit Tests
- `src/tests/utils/duplicateDetection.test.js`: Tests for utility functions
- `src/tests/controllers/violationsController.test.js`: Integration tests

### Test Coverage
- Distance calculation
- Date comparison
- Duplicate detection logic
- Data merging functions
- API endpoints with duplicate handling

## Performance Considerations

### Query Optimization
- Initial filtering by type and date range (±1 day)
- Geospatial queries for location proximity
- Similarity calculation only on filtered results

### Batch Processing
- Sequential processing to handle duplicates properly
- Individual duplicate checking for each violation
- Comprehensive error handling

## Error Handling

### Common Scenarios
- Invalid coordinates
- Missing required fields
- Geocoding failures
- Database connection issues

### Error Response Format
```javascript
{
  "success": false,
  "message": "Error description",
  "errors": [
    {
      "index": 0,
      "error": "Specific error message"
    }
  ]
}
```

## Migration from Existing System

### Backward Compatibility
- Existing `source_url` field maintained
- New `source_urls` array field added
- Old API format still supported (without action parameter)

### Data Migration
- Existing violations work without changes
- New violations can use enhanced duplicate detection
- Gradual migration of source URLs to array format

## Configuration

### Environment Variables
No additional environment variables required. Configuration is handled through constants in the code.

### Customization
To adjust duplicate detection sensitivity:

1. Modify `SIMILARITY_THRESHOLD` in `src/utils/duplicateDetection.js`
2. Adjust `MAX_DISTANCE_METERS` for location tolerance
3. Update validation rules in `src/middleware/validators.js`

## Monitoring and Logging

### Log Messages
- Duplicate detection results
- Merge operations
- Geocoding attempts
- Batch processing progress

### Metrics to Monitor
- Duplicate detection rate
- Merge vs. create ratio
- Processing time for batch operations
- Error rates in duplicate detection