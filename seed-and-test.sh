#!/bin/bash

echo "🚀 Setting up Sweepro Backend for Testing"
echo "============================================="

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js first."
    exit 1
fi

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo "❌ npm is not installed. Please install npm first."
    exit 1
fi

echo "✅ Node.js and npm are installed"

# Install dependencies if node_modules doesn't exist
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
    if [ $? -ne 0 ]; then
        echo "❌ Failed to install dependencies"
        exit 1
    fi
    echo "✅ Dependencies installed successfully"
else
    echo "✅ Dependencies already installed"
fi

# Check if .env file exists
if [ ! -f ".env" ]; then
    echo "⚠️  .env file not found. Please create one with your database configuration."
    echo "Example .env content:"
    echo "DATABASE_URL=\"postgresql://username:password@localhost:5432/sweepro_db\""
    echo "JWT_SECRET=\"your-secret-key\""
    exit 1
fi

echo "✅ Environment configuration found"

# Run database migrations
echo "🔄 Running database migrations..."
npx prisma migrate deploy
if [ $? -ne 0 ]; then
    echo "❌ Failed to run migrations"
    exit 1
fi
echo "✅ Database migrations completed"

# Seed the database
echo "🌱 Seeding database with test data..."
npm run seed
if [ $? -ne 0 ]; then
    echo "❌ Failed to seed database"
    exit 1
fi
echo "✅ Database seeded successfully"

echo ""
echo "🎉 Setup Complete! Your database now contains:"
echo "   • 5 test customers with active subscriptions"
echo "   • 5 test maids with profiles"
echo "   • 1 admin user"
echo "   • 14 bookings with different statuses"
echo "   • 3 services and subscription plans"
echo ""

echo "🧪 Ready for Postman Testing!"
echo "=============================="
echo "📖 Check POSTMAN_TEST_GUIDE.md for detailed testing instructions"
echo "🔑 Test Accounts:"
echo "   Customer: customer@sweepro.com / customer123"
echo "   Maid: maid@sweepro.com / maid123"
echo "   Admin: admin@sweepro.com / admin123"
echo ""

echo "🚀 Starting server..."
echo "   Press Ctrl+C to stop the server"
echo ""

# Start the server
npm start
