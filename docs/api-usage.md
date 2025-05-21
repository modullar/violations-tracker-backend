# Syria Violations Tracker API Usage Guide

This document provides examples of how to use the Syria Violations Tracker API.

## Table of Contents

- [Authentication](#authentication)
- [Working with Violations](#working-with-violations)
- [Geospatial Queries](#geospatial-queries)
- [Filtering and Pagination](#filtering-and-pagination)
- [Report Parsing with Claude AI](#report-parsing-with-claude-ai)
- [Error Handling](#error-handling)
- [Language Support](#language-support)

## Authentication

### Register a New User

```bash
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Example User",
    "email": "user@example.com",
    "password": "securepassword",
    "organization": "Human Rights Organization"
  }'
```

### Login and Get Token

```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "securepassword"
  }'
```

Response:
```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

### Get Current User's Profile

```bash
curl -X GET http://localhost:5000/api/auth/me \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

## Working with Violations

### Get All Violations

```bash
curl -X GET http://localhost:5000/api/violations
```

### Get All Violations with Language Preference

```bash
# Get violations with filters in Arabic
curl -X GET "http://localhost:5000/api/violations?lang=ar"

# Get violations with filters in English (default)
curl -X GET "http://localhost:5000/api/violations?lang=en"
```

### Get a Specific Violation

```bash
curl -X GET http://localhost:5000/api/violations/VIOLATION_ID_HERE
```

### Create a New Violation (Requires Authentication)

```bash
curl -X POST http://localhost:5000/api/violations \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -d '{
    "type": "AIRSTRIKE",
    "date": "2023-06-15",
    "reported_date": "2023-06-16",
    "location": {
      "coordinates": [37.1, 36.2],
      "name": {
        "en": "Aleppo",
        "ar": "حلب"
      },
      "administrative_division": {
        "en": "Aleppo Governorate",
        "ar": "محافظة حلب"
      }
    },
    "description": {
      "en": "Aerial bombardment of civilian area in eastern Aleppo",
      "ar": "قصف جوي على منطقة مدنية في شرق حلب"
    },
    "source": {
      "en": "Syrian Observatory for Human Rights",
      "ar": "المرصد السوري لحقوق الإنسان"
    },
    "source_url": {
      "en": "https://example.com/en/sohr/report/12345",
      "ar": "https://example.com/ar/sohr/report/12345"
    },
    "verified": true,
    "certainty_level": "confirmed",
    "verification_method": {
      "en": "Multiple eyewitness accounts and satellite imagery",
      "ar": "شهادات متعددة من شهود عيان وصور الأقمار الصناعية"
    },
    "casualties": 12,
    "victims": [
      {
        "age": 34,
        "gender": "male",
        "status": "civilian",
        "group_affiliation": {
          "en": "Local Humanitarian Group",
          "ar": "مجموعة إنسانية محلية"
        },
        "sectarian_identity": {
          "en": "Sunni",
          "ar": "سني"
        },
        "death_date": "2023-06-15"
      }
    ],
    "perpetrator": {
      "en": "Syrian Air Force",
      "ar": "سلاح الجو السوري"
    },
    "perpetrator_affiliation": {
      "en": "government",
      "ar": "حكومة"
    },
    "media_links": [
      "https://example.com/evidence/airstrike_1.jpg",
      "https://example.com/evidence/airstrike_1_video.mp4"
    ],
    "tags": [
      { "en": "airstrike", "ar": "قصف جوي" },
      { "en": "civilian", "ar": "مدني" },
      { "en": "urban area", "ar": "منطقة حضرية" }
    ]
  }'
```

### Update a Violation (Requires Authentication)

```bash
curl -X PUT http://localhost:5000/api/violations/VIOLATION_ID_HERE \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -d '{
    "description": {
      "en": "Updated description with new information",
      "ar": "وصف محدث مع معلومات جديدة"
    },
    "verified": true,
    "certainty_level": "confirmed",
    "casualties": 15
  }'
```

### Delete a Violation (Admin Only)

```bash
curl -X DELETE http://localhost:5000/api/violations/VIOLATION_ID_HERE \
  -H "Authorization: Bearer ADMIN_TOKEN_HERE"
```

## Geospatial Queries

### Get Violations Within a Radius (in km)

```bash
curl -X GET "http://localhost:5000/api/violations/radius/36.2/37.1/50"
```

### Filter by Location with Coordinates

```bash
curl -X GET "http://localhost:5000/api/violations?latitude=36.2&longitude=37.1&radius=50"
```

## Filtering and Pagination

### Filter by Violation Type

```bash
curl -X GET "http://localhost:5000/api/violations?type=AIRSTRIKE"
```

### Filter by Date Range

```bash
curl -X GET "http://localhost:5000/api/violations?startDate=2023-01-01&endDate=2023-12-31"
```

### Filter by Administrative Division

```bash
# In English (default)
curl -X GET "http://localhost:5000/api/violations?administrative_division=Aleppo%20Governorate"

# In Arabic
curl -X GET "http://localhost:5000/api/violations?administrative_division=محافظة%20حلب&lang=ar"
```

### Filter by Perpetrator

```bash
# In English (default)
curl -X GET "http://localhost:5000/api/violations?perpetrator=Syrian%20Air%20Force"

# In Arabic
curl -X GET "http://localhost:5000/api/violations?perpetrator=سلاح%20الجو%20السوري&lang=ar"
```

### Filter by Description Content

```bash
# Search within English descriptions (default)
curl -X GET "http://localhost:5000/api/violations?description=bombardment"

# Search within Arabic descriptions
curl -X GET "http://localhost:5000/api/violations?description=قصف&lang=ar"
```

### Filter by Verification Status

```bash
curl -X GET "http://localhost:5000/api/violations?verified=true"
```

### Filter by Certainty Level

```bash
curl -X GET "http://localhost:5000/api/violations?certainty_level=confirmed"
```

### Multiple Filters

```bash
curl -X GET "http://localhost:5000/api/violations?type=AIRSTRIKE&verified=true&startDate=2023-01-01&endDate=2023-12-31"
```

### Pagination

```bash
curl -X GET "http://localhost:5000/api/violations?page=2&limit=10"
```

### Sorting

```bash
curl -X GET "http://localhost:5000/api/violations?sort=-date"  # Sort by date descending
curl -X GET "http://localhost:5000/api/violations?sort=casualties"  # Sort by casualties ascending
curl -X GET "http://localhost:5000/api/violations?sort=-date,type"  # Sort by date desc, then type asc
```

## Error Handling

All API endpoints return consistent error responses:

```json
{
  "success": false,
  "error": "Detailed error message"
}
```

Common HTTP status codes:
- 400: Bad Request (validation error)
- 401: Unauthorized (authentication required)
- 403: Forbidden (insufficient permissions)
- 404: Not Found (resource doesn't exist)
- 500: Server Error (unexpected error)

## Report Parsing with Claude AI

The Report Parsing feature allows you to automatically extract structured violation data from human rights reports using Claude AI.

### Submit a Report for Parsing (Requires Editor or Admin Role)

```bash
curl -X POST http://localhost:5000/api/reports/parse \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -d '{
    "reportText": "On May 15, 2023, an airstrike hit a residential building in eastern Aleppo, killing 5 civilians and injuring 12 others. The Syrian Observatory for Human Rights reported that the attack was carried out at approximately 3:30 PM local time, targeting the Al-Firdous neighborhood. Residents reported seeing military aircraft in the area shortly before the bombing. Local rescue teams spent hours removing bodies from the rubble. Among the dead were two children and an elderly woman. The following day, on May 16, artillery shelling was reported in the rural areas south of Idlib, resulting in damage to agricultural land but no casualties.",
    "sourceURL": {
      "name": "Syrian Observatory for Human Rights",
      "url": "https://example.com/sohr/report/2023/05/16",
      "reportDate": "2023-05-16"
    }
  }'
```

Response:
```json
{
  "success": true,
  "data": {
    "jobId": "614c5387b45d8e001f3e4a12",
    "estimatedProcessingTime": "2 minutes",
    "submittedAt": "2023-05-17T14:23:45.123Z"
  }
}
```

### Check Job Status

```bash
curl -X GET http://localhost:5000/api/reports/jobs/614c5387b45d8e001f3e4a12 \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

Response (while processing):
```json
{
  "success": true,
  "data": {
    "id": "614c5387b45d8e001f3e4a12",
    "status": "processing",
    "progress": 40,
    "submittedBy": "John Doe",
    "submittedAt": "2023-05-17T14:23:45.123Z",
    "estimatedProcessingTime": "2 minutes",
    "source": {
      "name": "Syrian Observatory for Human Rights",
      "url": "https://example.com/sohr/report/2023/05/16",
      "reportDate": "2023-05-16"
    }
  }
}
```

Response (when completed):
```json
{
  "success": true,
  "data": {
    "id": "614c5387b45d8e001f3e4a12",
    "status": "completed",
    "progress": 100,
    "submittedBy": "John Doe",
    "submittedAt": "2023-05-17T14:23:45.123Z",
    "estimatedProcessingTime": "2 minutes",
    "source": {
      "name": "Syrian Observatory for Human Rights",
      "url": "https://example.com/sohr/report/2023/05/16",
      "reportDate": "2023-05-16"
    },
    "results": {
      "parsedViolationsCount": 2,
      "createdViolationsCount": 2,
      "violations": [
        "614c5387b45d8e001f3e4a13",
        "614c5387b45d8e001f3e4a14"
      ],
      "failedViolations": []
    }
  }
}
```

### List All Jobs (Admin Only)

```bash
curl -X GET http://localhost:5000/api/reports/jobs \
  -H "Authorization: Bearer ADMIN_TOKEN_HERE"
```

Response:
```json
{
  "success": true,
  "count": 2,
  "pagination": {
    "page": 1,
    "limit": 10,
    "totalPages": 1,
    "totalJobs": 2
  },
  "data": [
    {
      "id": "614c5387b45d8e001f3e4a12",
      "status": "completed",
      "progress": 100,
      "submittedBy": "John Doe",
      "submittedAt": "2023-05-17T14:23:45.123Z"
    },
    {
      "id": "614c5387b45d8e001f3e4a11",
      "status": "failed",
      "progress": 40,
      "submittedBy": "Jane Smith",
      "submittedAt": "2023-05-16T10:15:30.421Z"
    }
  ]
}
```

## Statistics

Get violation statistics (counts by type, location, etc.):

```bash
curl -X GET http://localhost:5000/api/violations/stats
```

Response:
```json
{
  "success": true,
  "data": {
    "totalViolations": 128,
    "totalCasualties": 876,
    "byType": [
      {"_id": "AIRSTRIKE", "count": 42},
      {"_id": "SHELLING", "count": 31},
      {"_id": "DETENTION", "count": 24}
    ],
    "byLocation": [
      {"_id": "Aleppo Governorate", "count": 45},
      {"_id": "Idlib Governorate", "count": 38}
    ],
    "byYear": [
      {"_id": 2021, "count": 42},
      {"_id": 2022, "count": 58},
      {"_id": 2023, "count": 28}
    ]
  }
}
```

## Language Support

The API supports both English (en) and Arabic (ar) content for violations. Text fields are stored with localized versions:

### Localized Fields

The following fields support both English and Arabic content:

- `location.name` - Name of the location
- `location.administrative_division` - Administrative division
- `description` - Violation description
- `source` - Source of the violation report
- `source_url` - URL of the source in different languages
- `verification_method` - Method used for verification
- `perpetrator` - Perpetrator information
- `perpetrator_affiliation` - Affiliation of the perpetrator
- `victims[].group_affiliation` - Group affiliation of victims
- `victims[].sectarian_identity` - Sectarian identity of victims
- `tags` - Tags for categorizing violations

### Language Selection

When querying violations, you can specify a language preference using the `lang` query parameter:

```bash
# Get violations with Arabic content prioritized
curl -X GET "http://localhost:5000/api/violations?lang=ar"

# Get violations with English content prioritized (default)
curl -X GET "http://localhost:5000/api/violations?lang=en"
```

This parameter affects search filters like location, description, perpetrator, etc.

### Example Response with Localized Fields

```json
{
  "location": {
    "coordinates": [37.1, 36.2],
    "name": {
      "en": "Aleppo",
      "ar": "حلب"
    },
    "administrative_division": {
      "en": "Aleppo Governorate",
      "ar": "محافظة حلب"
    }
  },
  "description": {
    "en": "Aerial bombardment of civilian area in eastern Aleppo",
    "ar": "قصف جوي على منطقة مدنية في شرق حلب"
  },
  "source_url": {
    "en": "https://example.com/en/report",
    "ar": "https://example.com/ar/report"
  }
}
```
```