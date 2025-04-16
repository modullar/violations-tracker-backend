/**
 * Custom error response class to standardize error format
 * @extends Error
 */
class ErrorResponse extends Error {
  /**
   * Create a new ErrorResponse
   * @param {string|string[]} message - Error message or array of messages
   * @param {number} statusCode - HTTP status code
   */
  constructor(message, statusCode) {
    super(Array.isArray(message) ? message.join(', ') : message);
    this.statusCode = statusCode;
  }
}

module.exports = ErrorResponse;