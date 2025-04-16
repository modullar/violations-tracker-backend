module.exports = {
  testEnvironment: 'node',
  testTimeout: 30000, // Increased timeout for async tests
  setupFilesAfterEnv: ['./src/tests/setup.js'], // Setup file
  coveragePathIgnorePatterns: [
    '/node_modules/',
    '/src/tests/'
  ],
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/tests/**/*.js',
    '!src/config/**/*.js',
    '!src/utils/seeder.js',
    '!src/server.js'
  ],
  verbose: true
};