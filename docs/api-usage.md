# Syria Violations Tracker API Usage Guide

This document provides examples of how to use the Syria Violations Tracker API.

## Table of Contents

- [Authentication](#authentication)
- [Working with Violations](#working-with-violations)
- [Geospatial Queries](#geospatial-queries)
- [Filtering and Pagination](#filtering-and-pagination)
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

### Parse Violation Reports Using Claude LLM

Parse unstructured textual reports (in English or Arabic) into structured violation objects using Claude LLM.

```bash
curl -X POST http://localhost:5000/api/violations/parse \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -d '{
    "text": "On January 15, 2023, civilian areas in Aleppo city center were subjected to shelling by Syrian government forces. The attack resulted in 12 casualties and widespread damage to residential buildings. Local sources confirmed the attack originated from government-controlled areas.",
    "language": "en",
    "detectDuplicates": true,
    "updateExisting": true,
    "preview": false
  }'
```

Parameters:
- `text` (required): The text report to parse into structured violations
- `language` (optional): Primary language of the report ("en" or "ar", defaults to "en")
- `detectDuplicates` (optional): Whether to detect and handle duplicates (defaults to true)
- `updateExisting` (optional): Whether to update existing records when duplicates are found (defaults to true)
- `preview` (optional): If true, returns parsed violations without saving them (defaults to false)

Response with `preview=true`:
```json
{
  "success": true,
  "count": 1,
  "data": [
    {
      "type": "SHELLING",
      "date": "2023-01-15",
      "location": {
        "name": {
          "en": "Aleppo City Center",
          "ar": "وسط مدينة حلب"
        },
        "administrative_division": {
          "en": "Aleppo Governorate",
          "ar": "محافظة حلب"
        }
      },
      "description": {
        "en": "Shelling of civilian areas in Aleppo city center resulting in 12 casualties and widespread damage to residential buildings.",
        "ar": "قصف مناطق مدنية في وسط مدينة حلب أدى إلى سقوط 12 ضحية وأضرار واسعة في المباني السكنية."
      },
      "verified": false,
      "certainty_level": "confirmed",
      "casualties": 12,
      "perpetrator": {
        "en": "Syrian Government Forces",
        "ar": "قوات الحكومة السورية"
      },
      "perpetrator_affiliation": "assad_regime"
    }
  ],
  "preview": true
}
```

Response when saving violations:
```json
{
  "success": true,
  "summary": {
    "total": 1,
    "created": 1,
    "updated": 0,
    "skipped": 0
  },
  "data": [
    {
      "_id": "60d21b4667d0d8992e610c85",
      "type": "SHELLING",
      "date": "2023-01-15",
      "location": {
        "name": {
          "en": "Aleppo City Center",
          "ar": "وسط مدينة حلب"
        }
      },
      "createdAt": "2023-06-23T14:25:22.892Z",
      "updatedAt": "2023-06-23T14:25:22.892Z"
    }
  ]
}
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