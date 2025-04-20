const morgan = require('morgan');
const logger = require('../config/logger');

// Create a stream object with a 'write' function that will be used by morgan
const stream = {
  write: message => logger.info(message && typeof message === 'string' ? message.trim() : '')
};

// Create a middleware function to log HTTP requests
const requestLogger = morgan(
  // Define the format string
  ':remote-addr - :remote-user [:date[clf]] ":method :url HTTP/:http-version" :status :res[content-length] ":referrer" ":user-agent" - :response-time ms',
  { stream }
);

module.exports = requestLogger;