# Use an official Node.js runtime as a parent image
FROM node:20-alpine

# Set working directory inside the container
WORKDIR /app

# Copy package.json and package-lock.json first (for caching)
COPY package*.json ./

# Install dependencies
RUN npm install --production

# Copy the rest of the application
COPY . .

# Expose your backend port (example: 5000)
EXPOSE 5000

# Set environment variables (optional)
ENV NODE_ENV=production

# Command to run your app
CMD ["node", "server.js"]
