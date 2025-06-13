FROM node:18-alpine

# Create app directory
WORKDIR /usr/src/app

# Set production environment
ENV NODE_ENV=production

# Install app dependencies
# A wildcard is used to ensure both package.json AND package-lock.json are copied
COPY package*.json ./

# Install production dependencies
RUN npm ci --omit=dev

# Install only migrate-mongo for database migrations
RUN npm install migrate-mongo

# Bundle app source
COPY . .

# Create logs directory
RUN mkdir -p logs

# Expose the port the app runs on
EXPOSE 5000

# Create a script to run migrations and start the app
RUN echo '#!/bin/sh' > /usr/src/app/start.sh && \
    echo 'echo "Running database migrations..."' >> /usr/src/app/start.sh && \
    echo 'npx migrate-mongo up' >> /usr/src/app/start.sh && \
    echo 'echo "Starting application..."' >> /usr/src/app/start.sh && \
    echo 'node src/server.js' >> /usr/src/app/start.sh && \
    chmod +x /usr/src/app/start.sh

# Start the application with migrations
CMD ["/usr/src/app/start.sh"]