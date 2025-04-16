#!/bin/bash

# Simple deployment script for the Syria Violations Tracker Backend
# This script can be modified for different deployment environments

# Exit if any command fails
set -e

echo "Starting deployment process..."

# Pull latest changes
if [ -d ".git" ]; then
    echo "Git repository detected, pulling latest changes..."
    git pull
else
    echo "Not a git repository, skipping pull..."
fi

# Install dependencies
echo "Installing dependencies..."
npm ci

# Run tests
echo "Running tests..."
npm test

# Build application (if necessary)
# echo "Building application..."
# npm run build

# Set environment to production
export NODE_ENV=production

# Stop the existing process (if running)
# This section can be customized based on your process management strategy
# For PM2:
if command -v pm2 &> /dev/null; then
    echo "Stopping existing process with PM2..."
    pm2 stop syria-violations-api || true
fi

# Start the application
echo "Starting application..."
if command -v pm2 &> /dev/null; then
    # Using PM2 for process management
    pm2 start src/server.js --name syria-violations-api
else
    # Plain Node.js for environments without PM2
    echo "PM2 not found, starting with Node.js..."
    echo "To run in background, use: nohup npm start &"
    echo "Starting in foreground..."
    npm start
fi

echo "Deployment completed successfully."