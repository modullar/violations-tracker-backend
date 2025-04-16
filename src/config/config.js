const path = require('path');
const fs = require('fs');

// Load environment specific .env file
const loadEnv = () => {
  const NODE_ENV = process.env.NODE_ENV || 'development';
  const envPath = path.resolve(process.cwd(), `.env.${NODE_ENV}`);
  
  // First try environment specific file (.env.development, .env.production, etc)
  if (fs.existsSync(envPath)) {
    require('dotenv').config({ path: envPath });
  } else {
    // Fallback to default .env file
    require('dotenv').config();
  }
  
  console.log(`Loaded environment configuration for: ${NODE_ENV}`);
};

loadEnv();

module.exports = {
  env: process.env.NODE_ENV || 'development',
  port: process.env.PORT || 5001,
  mongoUri: process.env.MONGO_URI,
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '30d',
  jwtCookieExpire: parseInt(process.env.JWT_COOKIE_EXPIRE) || 30,
  // API keys for various geocoding services
  googleApiKey: process.env.GOOGLE_API_KEY,
  mapquestApiKey: process.env.MAPQUEST_API_KEY,
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
    max: parseInt(process.env.RATE_LIMIT_MAX) || 100, // Limit each IP to 100 requests per windowMs
  }
};