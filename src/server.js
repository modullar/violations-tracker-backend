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

// Initialize queue service
require('./services/queueService');

// Route files
const authRoutes = require('./routes/authRoutes');
const violationRoutes = require('./routes/violationRoutes');
const userRoutes = require('./routes/userRoutes');
const reportRoutes = require('./routes/reportRoutes');

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

// Import auth middleware for Bull Board
const { protect, authorize } = require('./middleware/auth');

// Mount routers
app.use('/api/auth', authRoutes);
app.use('/api/violations', violationRoutes);
app.use('/api/users', userRoutes);
app.use('/api/reports', reportRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'API is running',
    environment: config.env,
    timestamp: new Date().toISOString()
  });
});

// Add Bull Board UI for job monitoring
const { createBullBoard } = require('@bull-board/api');
const { BullAdapter } = require('@bull-board/api/bullAdapter');
const { ExpressAdapter } = require('@bull-board/express');

// Import the queue
const { reportParsingQueue } = require('./services/queueService');

// Setup Bull Board
const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath('/admin/queues');

createBullBoard({
  queues: [new BullAdapter(reportParsingQueue)],
  serverAdapter
});

// Mount Bull Board UI
// For development, allow public access - CHANGE THIS FOR PRODUCTION!
if (process.env.NODE_ENV === 'production') {
  // In production, protect with authentication
  app.use('/admin/queues', protect, authorize('admin'), serverAdapter.getRouter());
} else {
  // In development, allow public access
  app.use('/admin/queues', serverAdapter.getRouter());
  console.log('⚠️ WARNING: Queue dashboard accessible without authentication in development mode');
}

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