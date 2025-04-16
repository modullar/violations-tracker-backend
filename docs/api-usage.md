# Syria Violations Tracker API Usage Guide

This document provides examples of how to use the Syria Violations Tracker API.

## Table of Contents

- [Authentication](#authentication)
- [Working with Violations](#working-with-violations)
- [Geospatial Queries](#geospatial-queries)
- [Filtering and Pagination](#filtering-and-pagination)
- [Error Handling](#error-handling)

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
      "name": "Aleppo",
      "administrative_division": "Aleppo Governorate"
    },
    "description": "Aerial bombardment of civilian area in eastern Aleppo",
    "source": "Syrian Observatory for Human Rights",
    "source_url": "https://example.com/sohr/report/12345",
    "verified": true,
    "certainty_level": "confirmed",
    "verification_method": "Multiple eyewitness accounts and satellite imagery",
    "casualties": 12,
    "victims": [
      {
        "age": 34,
        "gender": "male",
        "status": "civilian",
        "sectarian_identity": "Sunni",
        "death_date": "2023-06-15"
      }
    ],
    "perpetrator": "Syrian Air Force",
    "perpetrator_affiliation": "government",
    "media_links": [
      "https://example.com/evidence/airstrike_1.jpg",
      "https://example.com/evidence/airstrike_1_video.mp4"
    ],
    "tags": ["airstrike", "civilian", "urban area"]
  }'
```

### Update a Violation (Requires Authentication)

```bash
curl -X PUT http://localhost:5000/api/violations/VIOLATION_ID_HERE \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -d '{
    "description": "Updated description with new information",
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
curl -X GET "http://localhost:5000/api/violations?administrative_division=Aleppo%20Governorate"
```

### Filter by Perpetrator

```bash
curl -X GET "http://localhost:5000/api/violations?perpetrator=Syrian%20Air%20Force"
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