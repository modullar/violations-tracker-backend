FROM node:18-alpine

# Create app directory
WORKDIR /usr/src/app

# Install app dependencies
# A wildcard is used to ensure both package.json AND package-lock.json are copied
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Bundle app source
COPY . .

# Create logs directory
RUN mkdir -p logs

# Expose the port the app runs on
EXPOSE 5000

# Start the application
CMD ["node", "src/server.js"]