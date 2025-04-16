/**
 * Async handler wrapper to eliminate try-catch blocks in controllers
 * @param {Function} fn - The async function to wrap
 * @returns {Function} Express middleware handler
 */
const asyncHandler = fn => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

module.exports = asyncHandler;