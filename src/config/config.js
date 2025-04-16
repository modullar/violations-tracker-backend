require('dotenv').config();

module.exports = {
  env: process.env.NODE_ENV || 'development',
  port: process.env.PORT || 5000,
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