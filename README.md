# Syria Violations Tracker Backend

A RESTful API backend for tracking human rights violations in Syria, built with Node.js, Express, and MongoDB.

[![Violations Tracker CI](https://github.com/yourusername/violations-tracker-backend/actions/workflows/ci.yml/badge.svg)](https://github.com/yourusername/violations-tracker-backend/actions/workflows/ci.yml)
[![Deploy to Staging](https://github.com/yourusername/violations-tracker-backend/actions/workflows/staging-deploy.yml/badge.svg)](https://github.com/yourusername/violations-tracker-backend/actions/workflows/staging-deploy.yml)

## Features

- **RESTful API** with full CRUD operations for violations data
- **MongoDB** database with Mongoose ODM
- **Geospatial queries** for location-based filtering
- **JWT Authentication** with role-based access control
- **Input validation** for all endpoints
- **Comprehensive filtering** by type, date, location, and more
- **Pagination** for large datasets
- **Swagger documentation** for API endpoints
- **Error handling middleware** for consistent responses
- **Logging** for API requests and errors
- **Security features** including rate limiting, CORS, and input sanitization
- **Claude AI integration** for automated parsing of human rights reports
- **Background job processing** with Bull and Redis for handling long-running tasks

## API Endpoints

### Violations

- `GET /api/violations` - Get all violations (with filtering)
- `GET /api/violations/:id` - Get a specific violation
- `POST /api/violations` - Create a new violation (requires auth)
- `PUT /api/violations/:id` - Update a violation (requires auth)
- `DELETE /api/violations/:id` - Delete a violation (admin only)
- `GET /api/violations/radius/:latitude/:longitude/:radius` - Get violations within radius
- `GET /api/violations/stats` - Get violation statistics
- `POST /api/violations/batch` - Create multiple violations in batch (requires auth)

### Authentication

- `POST /api/auth/register` - Register a new user
- `POST /api/auth/login` - Log in and get token
- `GET /api/auth/me` - Get current user info (requires auth)
- `GET /api/auth/logout` - Log out current user

### Users (Admin only)

- `GET /api/users` - Get all users
- `GET /api/users/:id` - Get a specific user
- `POST /api/users` - Create a new user
- `PUT /api/users/:id` - Update a user
- `DELETE /api/users/:id` - Delete a user

### Report Parsing (New)

- `POST /api/reports/parse` - Submit a report for parsing (editor or admin)
- `GET /api/reports/jobs/:jobId` - Get status of a specific parsing job
- `GET /api/reports/jobs` - Get all parsing jobs (admin only)

## Getting Started

### Prerequisites

- Node.js (v18 or higher)
- MongoDB
- Redis (for background job processing)
- API key from HERE for geocoding (Optional but recommended for accurate location data)
- Claude API key (Required for report parsing feature)

### Installation

1. Clone the repository
```bash
git clone https://github.com/yourusername/violations-tracker-backend.git
cd violations-tracker-backend
```

2. Install dependencies
```bash
npm install
```

3. Set up environment variables
This project uses environment-specific configuration files:

- `.env.development` - Development environment (local)
- `.env.test` - Test environment
- `.env.staging` - Staging environment
- `.env.production` - Production environment

Create the appropriate `.env.[environment]` file based on your needs with the following variables:
```
NODE_ENV=development
PORT=5000
MONGO_URI=mongodb://localhost:27017/violations-tracker
JWT_SECRET=your_jwt_secret_key_here
JWT_EXPIRES_IN=30d

# Geocoding services
HERE_API_KEY=your_here_api_key_here
# Alternative geocoding options
# GOOGLE_API_KEY=your_google_api_key_here
# MAPQUEST_API_KEY=your_mapquest_api_key_here

# Rate limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX=100

# Claude API for report parsing
CLAUDE_API_KEY=your_claude_api_key_here
CLAUDE_API_ENDPOINT=https://api.anthropic.com/v1/messages
CLAUDE_MODEL=claude-3-5-sonnet-20240620
CLAUDE_MAX_TOKENS=4096

# Redis for queue processing
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
```

4. Import sample data (optional)
```bash
npm run seed
```

5. Start the server
```bash
# Development mode with auto-reload
npm run dev

# Staging mode
npm run staging

# Production mode
npm start

# Test mode (runs Jest tests)
npm test

# Build for production
npm run build
```

6. Access the API documentation
Open your browser and navigate to `http://localhost:5000/api-docs`

## API Documentation

Full API documentation is available via Swagger UI at `/api-docs` when the server is running.

### Violation Data Format

```json
{
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
  "tags": ["airstrike", "civilian", "urban area"],
  "related_violations": ["vio-12345", "vio-12346"]
}
```

## Authentication and Authorization

The API uses JWT for authentication. To access protected endpoints:

1. Register or log in to receive a token
2. Include the token in your requests as a Bearer token in the Authorization header:
   ```
   Authorization: Bearer your_token_here
   ```

### User Roles

- **User**: Can view public data
- **Editor**: Can create and update violations
- **Admin**: Full access, including user management

## Running Tests

```bash
# Run tests once
npm test

# Run tests in watch mode
npm run test:watch
```

## Deployment

For production deployment:

1. Set environment variables for your production environment
2. Build and start the application:
```bash
npm start
```

## Contributing

We welcome contributions to the Syria Violations Tracker Backend! This is an open source project dedicated to documenting human rights violations and supporting accountability efforts.

If you'd like to contribute, please contact us at **info@syrianotion.live** for guidance on how to get involved. Whether you're interested in:

- Reporting bugs or suggesting features
- Contributing code improvements
- Helping with documentation
- Providing translations
- Sharing expertise in human rights documentation

We'd love to hear from you and discuss how you can contribute to this important project.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Report Parsing with Claude AI

The system includes a feature to automatically parse human rights reports into structured violation data:

1. **Submit a report**: Send report text to `/api/reports/parse` with optional source information
2. **Background processing**: Report is processed asynchronously using Claude AI
3. **Check status**: Monitor job progress via `/api/reports/jobs/:jobId`
4. **Results**: Upon completion, structured violations are created in the database

### Job Monitoring Dashboard

Administrators can monitor background job processing through a UI dashboard:

- Access the dashboard at `/admin/queues`
- View job statuses, progress, and results
- Manage failed jobs and retry processing if needed
- See real-time queue statistics

Example request:
```json
POST /api/reports/parse
{
  "reportText": "On May 15, 2023, an airstrike hit a residential building in eastern Aleppo...",
  "sourceURL": {
    "name": "Syrian Network for Human Rights",
    "url": "https://example.com/report",
    "reportDate": "2023-05-16"
  }
}
```

## Acknowledgements

- Based on the work of human rights documentation organizations in Syria
- Uses HERE Geocoding API for location services
- Uses Anthropic's Claude AI for natural language processing