# Syria Violations Tracker Backend

A RESTful API backend for tracking human rights violations in Syria, built with Node.js, Express, and MongoDB.

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

## API Endpoints

### Violations

- `GET /api/violations` - Get all violations (with filtering)
- `GET /api/violations/:id` - Get a specific violation
- `POST /api/violations` - Create a new violation (requires auth)
- `PUT /api/violations/:id` - Update a violation (requires auth)
- `DELETE /api/violations/:id` - Delete a violation (admin only)
- `GET /api/violations/radius/:latitude/:longitude/:radius` - Get violations within radius
- `GET /api/violations/stats` - Get violation statistics

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

## Getting Started

### Prerequisites

- Node.js (v18 or higher)
- MongoDB
- API key from MapTiler for geocoding (optional)

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
Create a `.env` file in the root directory with the following variables:
```
NODE_ENV=development
PORT=5000
MONGO_URI=mongodb://localhost:27017/syria-violations-tracker
JWT_SECRET=your_jwt_secret_key_here
JWT_EXPIRES_IN=30d
MAPTILER_API_KEY=your_maptiler_api_key_here
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX=100
```

4. Import sample data (optional)
```bash
npm run seed
```

5. Start the server
```bash
# Development mode with auto-reload
npm run dev

# Production mode
npm start
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

## License

This project is licensed under the ISC License.

## Acknowledgements

- Based on the work of human rights documentation organizations in Syria
- Uses MapTiler for geocoding services