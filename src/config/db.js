const mongoose = require('mongoose');
const logger = require('./logger');
const config = require('./config');

const connectDB = async () => {
  try {
    if (!config.mongoUri) {
      logger.error('MongoDB URI is not defined in the environment variables');
      process.exit(1);
    }
    
    const conn = await mongoose.connect(config.mongoUri);
    
    logger.info(`MongoDB Connected: ${conn.connection.host} (${config.env} environment)`);
  } catch (error) {
    logger.error(`Error connecting to MongoDB: ${error.message}`);
    process.exit(1);
  }
};

module.exports = connectDB;