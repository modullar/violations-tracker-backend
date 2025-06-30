// In this file you can configure migrate-mongo
const path = require('path');
const fs = require('fs');

// Load environment specific .env file
const NODE_ENV = process.env.NODE_ENV || 'development';
const envPath = path.resolve(process.cwd(), `.env.${NODE_ENV}`);

// First try environment specific file (.env.development, .env.production, etc)
if (fs.existsSync(envPath)) {
  require('dotenv').config({ path: envPath });
  console.log(`Loaded environment configuration for: ${NODE_ENV} from ${envPath}`);
} else {
  // Fallback to default .env file
  require('dotenv').config();
  console.log('Loaded environment configuration from default .env file');
}

// Default database configurations for different environments
const dbConfigs = {
  development: {
    url: process.env.MONGO_URI || 'mongodb://localhost:27017/syria-violations-tracker',
    databaseName: '' // Empty because the database name is included in the URL
  },
  test: {
    url: process.env.MONGO_URI || 'mongodb://localhost:27017/violations-tracker-test',
    databaseName: ''
  },
  staging: {
    url: process.env.MONGO_URI,
    databaseName: ''
  },
  production: {
    url: process.env.MONGO_URI,
    databaseName: ''
  }
};

// Get the config for current environment
const envConfig = dbConfigs[NODE_ENV] || dbConfigs.development;

console.log(`Using MongoDB connection for environment: ${NODE_ENV}`);
// Remove password from log output if present in the connection string
const logUrl = envConfig.url ? envConfig.url.replace(/:([^@]+)@/, ':***@') : 'Not configured';
console.log(`MongoDB URL: ${logUrl}`);

const config = {
  mongodb: {
    url: envConfig.url,
    databaseName: envConfig.databaseName,
    options: {
      useNewUrlParser: true, // Will be removed in newer versions but kept for consistency
      useUnifiedTopology: true // Will be removed in newer versions but kept for consistency
    }
  },

  // The migrations dir, can be an relative or absolute path. Only edit this when really necessary.
  migrationsDir: 'migrations',

  // The mongodb collection where the applied changes are stored. Only edit this when really necessary.
  changelogCollectionName: 'changelog',

  // The mongodb collection where the lock will be created.
  lockCollectionName: 'changelog_lock',

  // The value in seconds for the TTL index that will be used for the lock. Value of 0 will disable the feature.
  lockTtl: 0,

  // The file extension to create migrations and search for in migration dir 
  migrationFileExtension: '.js',

  // Enable the algorithm to create a checksum of the file contents and use that in the comparison to determine
  // if the file should be run.  Requires that scripts are coded to be run multiple times.
  useFileHash: true,

  // Don't change this, unless you know what you're doing
  moduleSystem: 'commonjs',
};

module.exports = config; 