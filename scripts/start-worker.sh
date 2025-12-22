#!/bin/bash

# Worker startup script for Render deployment
echo "🔄 Starting Sweepro Background Worker..."

# Wait for database and Redis to be ready
echo "⏳ Waiting for services to be ready..."
sleep 15

# Ensure Prisma client is generated
echo "🔧 Ensuring Prisma client is ready..."
npx prisma generate

# Start the background worker
echo "✅ Starting background worker..."
npm run worker