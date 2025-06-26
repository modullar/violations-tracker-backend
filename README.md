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
- **Telegram Scraping**: Automated scraping of Telegram channels for human rights violation reports, focusing on Syrian conflict documentation including airstrikes, shelling, detention, and civilian casualties
- **Report Processing**: Integration with LLM for automated violation parsing

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

### Reports Management

- `GET /api/reports` - Get all scraped reports with filtering and pagination
- `GET /api/reports/:id` - Get specific report by ID
- `GET /api/reports/stats` - Get comprehensive report statistics (Admin only)
- `GET /api/reports/ready-for-processing` - Get reports ready for LLM processing (Admin only)
- `PUT /api/reports/:id/mark-processed` - Mark report as processed (Admin only)
- `PUT /api/reports/:id/mark-failed` - Mark report as failed (Admin only)

### Query Parameters for GET /api/reports

- `page`, `limit` - Pagination
- `sort` - Sort order (default: -metadata.scrapedAt)
- `channel` - Filter by Telegram channel
- `parsedByLLM` - Filter by LLM processing status
- `status` - Filter by processing status (new, processing, parsed, failed, ignored)
- `language` - Filter by detected language (ar, en, mixed, unknown)
- `startDate`, `endDate` - Filter by incident date range
- `scrapedStartDate`, `scrapedEndDate` - Filter by scraping date range
- `keyword` - Filter by matched keywords
- `search` - Full-text search in report content

> **Note**: Keep this parameter list updated when adding new filter options to ensure comprehensive API documentation and effective monitoring capabilities.

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

## New: Telegram Scraper Integration

The system now includes automated Telegram scraping capabilities specifically focused on Syrian human rights violations:

### Features
- **Automated Scraping**: Runs every 5 minutes to collect recent posts from Syrian civil society and monitoring organizations
- **Keyword Matching**: Uses Arabic keywords to identify potential violations including airstrikes (غارة جوية), shelling (قصف), detention (اعتقال), and civilian casualties (ضحايا مدنيين)
- **Channel Management**: Configurable list of Telegram channels from Syrian monitoring organizations, civil defense groups, and human rights groups
- **Language Detection**: Automatic detection of Arabic, English, and mixed content
- **Duplicate Prevention**: Prevents duplicate reports from being saved
- **Status Tracking**: Tracks processing status of each scraped report

### Configuration Files
- `src/config/telegram-channels.yaml` - List of channels to monitor
- `src/config/violation-keywords.yaml` - Arabic keywords for violation detection

### API Endpoints

#### Reports Management
- `GET /api/reports` - Get all scraped reports with filtering and pagination
- `GET /api/reports/:id` - Get specific report by ID
- `GET /api/reports/stats` - Get comprehensive report statistics (Admin only)
- `GET /api/reports/ready-for-processing` - Get reports ready for LLM processing (Admin only)
- `PUT /api/reports/:id/mark-processed` - Mark report as processed (Admin only)
- `PUT /api/reports/:id/mark-failed` - Mark report as failed (Admin only)

#### Query Parameters for GET /api/reports
- `page`, `limit` - Pagination
- `sort` - Sort order (default: -metadata.scrapedAt)
- `channel` - Filter by Telegram channel
- `parsedByLLM` - Filter by LLM processing status
- `status` - Filter by processing status (new, processing, parsed, failed, ignored)
- `language` - Filter by detected language (ar, en, mixed, unknown)
- `startDate`, `endDate` - Filter by incident date range
- `scrapedStartDate`, `scrapedEndDate` - Filter by scraping date range
- `keyword` - Filter by matched keywords
- `search` - Full-text search in report content

> **Note**: Keep this parameter list updated when adding new filter options to ensure comprehensive API documentation and effective monitoring capabilities.

## Environment Variables

```env
NODE_ENV=development
PORT=5000
MONGO_URI=mongodb://localhost:27017/violations-tracker
JWT_SECRET=your-jwt-secret
JWT_EXPIRE=30d

# Redis for job queues
REDIS_HOST=localhost
REDIS_PORT=6379

# Optional: External APIs
GOOGLE_MAPS_API_KEY=your-google-maps-key
HERE_API_KEY=your-here-api-key
```

## Running Tests

```bash
# Run all tests
npm test

# Run tests with coverage
npm run test:coverage

# Run tests in watch mode
npm run test:watch

# Run specific test file
npm test -- src/tests/models/report.test.js
```

## API Documentation

The API includes comprehensive Swagger documentation:

- Main API: `GET /api-docs`
- Reports API: `GET /api-docs/reports`

## Background Jobs

The system includes automated background jobs:

### Telegram Scraping Job
- **Schedule**: Every 5 minutes
- **Function**: Scrapes configured Telegram channels for new posts
- **Keywords**: Matches Arabic keywords related to violations
- **Storage**: Saves matching posts as reports in the database

### Job Management
- View job status and statistics via the API
- Manual job triggering for testing
- Comprehensive error handling and logging

## Database Models

### Report Model
```javascript
{
  source_url: String,        // Telegram message URL
  text: String,             // Message content
  date: Date,               // Incident date
  parsedByLLM: Boolean,     // Processing status
  status: String,           // new|processing|parsed|failed|ignored
  metadata: {
    channel: String,        // Telegram channel name
    messageId: String,      // Telegram message ID
    scrapedAt: Date,       // When scraped
    matchedKeywords: [String], // Matched Arabic keywords
    language: String,       // Detected language
    mediaCount: Number,     // Number of media files
    viewCount: Number       // Message view count
  }
}
```

## Configuration Management

### Telegram Channels (`src/config/telegram-channels.yaml`)
```yaml
channels:
  - name: "SyrianCivilDefence"
    url: "https://t.me/SyrianCivilDefence"
    active: true
    priority: "high"
    language: "ar"

scraping:
  interval: 5                    # minutes
  lookback_window: 5            # minutes
  max_messages_per_channel: 50
  request_timeout: 30           # seconds
```

### Keywords (`src/config/violation-keywords.yaml`)
```yaml
keywords:
  AIRSTRIKE:
    - "غارة جوية"
    - "قصف جوي"
    - "طيران حربي"
  
  SHELLING:
    - "قصف"
    - "قذائف"
    - "مدفعية"
```

## Security

- **JWT Authentication**: Secure token-based authentication
- **Role-Based Access**: Admin, Editor, and User roles
- **Rate Limiting**: API rate limiting to prevent abuse
- **Input Validation**: Comprehensive input validation and sanitization
- **CORS Protection**: Configurable CORS settings

## Performance

- **Database Indexing**: Optimized MongoDB indexes for fast queries
- **Pagination**: Efficient pagination for large datasets
- **Caching**: Redis caching for frequently accessed data
- **Background Processing**: Non-blocking background job processing

## Monitoring

- **Logging**: Comprehensive logging with Winston
- **Health Checks**: Built-in health check endpoints
- **Job Monitoring**: Bull dashboard for job queue monitoring
- **Error Tracking**: Detailed error reporting and tracking

## Contributing

1. Fork the repository
2. Create a feature branch
3. Add tests for new functionality
4. Ensure all tests pass
5. Submit a pull request

## License

This project is licensed under the ISC License.

## Support

For support and questions, please create an issue on the repository or contact the development team.