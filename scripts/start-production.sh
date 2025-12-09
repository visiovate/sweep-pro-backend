#!/bin/bash

# Production startup script for Render deployment
echo "🚀 Starting Sweepro Backend in Production Mode..."

# Wait for database to be ready
echo "⏳ Waiting for database connection..."
sleep 10

# Run database migrations
echo "🔄 Running database migrations..."
npx prisma db push

# Seed database if needed (optional)
if [ "$SEED_DATABASE" = "true" ]; then
  echo "🌱 Seeding database..."
  npm run prisma:seed
fi

# Start the main application
echo "✅ Starting main application..."
npm start