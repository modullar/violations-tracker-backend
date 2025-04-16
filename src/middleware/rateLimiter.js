const rateLimit = require('express-rate-limit');
const config = require('../config/config');

const limiter = rateLimit({
  windowMs: config.rateLimit.windowMs, // Default: 15 minutes
  max: config.rateLimit.max, // Default: Limit each IP to 100 requests per windowMs
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  message: {
    success: false,
    error: 'Too many requests, please try again later.'
  },
  skip: (req) => {
    // Skip rate limiting for certain paths or users if needed
    // For example, skip for admin users or for health check endpoints
    return req.path === '/api/health';
  }
});

module.exports = limiter;