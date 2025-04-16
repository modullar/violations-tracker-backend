const express = require('express');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const swaggerUi = require('swagger-ui-express');
const YAML = require('yamljs');

const connectDB = require('./config/db');
const config = require('./config/config');
const logger = require('./config/logger');
const requestLogger = require('./middleware/logger');
const errorHandler = require('./middleware/error');
const rateLimiter = require('./middleware/rateLimiter');

// Load env vars
require('dotenv').config();

// Connect to database
connectDB();

// Route files
const authRoutes = require('./routes/authRoutes');
const violationRoutes = require('./routes/violationRoutes');
const userRoutes = require('./routes/userRoutes');

const app = express();

// Body parser
app.use(express.json());

// Request logging
app.use(requestLogger);

// Security middleware
app.use(helmet());
app.use(cors());
app.use(rateLimiter);

// Mount Swagger docs
const swaggerDocument = YAML.load(path.join(__dirname, 'swagger.yaml'));
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

// Mount routers
app.use('/api/auth', authRoutes);
app.use('/api/violations', violationRoutes);
app.use('/api/users', userRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'API is running',
    environment: config.env,
    timestamp: new Date().toISOString()
  });
});

// Error handling middleware
app.use(errorHandler);

// Handle 404 errors
app.use((req, res, next) => {
  res.status(404).json({
    success: false,
    error: 'Resource not found'
  });
});

const PORT = config.port;

const server = app.listen(
  PORT,
  logger.info(`Server running in ${config.env} mode on port ${PORT}`)
);

// Handle unhandled promise rejections
process.on('unhandledRejection', (err, promise) => {
  logger.error(`Unhandled Rejection: ${err.message}`);
  // Close server & exit process
  server.close(() => process.exit(1));
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  logger.error(`Uncaught Exception: ${err.message}`);
  // Close server & exit process
  server.close(() => process.exit(1));
});

module.exports = server;