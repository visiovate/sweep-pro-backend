@echo off
echo 🚀 Setting up SweepPro Backend for Testing
echo =============================================

REM Check if Node.js is installed
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Node.js is not installed. Please install Node.js first.
    pause
    exit /b 1
)

REM Check if npm is installed
npm --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ npm is not installed. Please install npm first.
    pause
    exit /b 1
)

echo ✅ Node.js and npm are installed

REM Install dependencies if node_modules doesn't exist
if not exist "node_modules" (
    echo 📦 Installing dependencies...
    npm install
    if %errorlevel% neq 0 (
        echo ❌ Failed to install dependencies
        pause
        exit /b 1
    )
    echo ✅ Dependencies installed successfully
) else (
    echo ✅ Dependencies already installed
)

REM Check if .env file exists
if not exist ".env" (
    echo ⚠️  .env file not found. Please create one with your database configuration.
    echo Example .env content:
    echo DATABASE_URL="postgresql://username:password@localhost:5432/sweepro_db"
    echo JWT_SECRET="your-secret-key"
    pause
    exit /b 1
)

echo ✅ Environment configuration found

REM Run database migrations
echo 🔄 Running database migrations...
npx prisma migrate deploy
if %errorlevel% neq 0 (
    echo ❌ Failed to run migrations
    pause
    exit /b 1
)
echo ✅ Database migrations completed

REM Seed the database
echo 🌱 Seeding database with test data...
npm run seed
if %errorlevel% neq 0 (
    echo ❌ Failed to seed database
    pause
    exit /b 1
)
echo ✅ Database seeded successfully

echo.
echo 🎉 Setup Complete! Your database now contains:
echo    • 5 test customers with active subscriptions
echo    • 5 test maids with profiles
echo    • 1 admin user
echo    • 14 bookings with different statuses
echo    • 3 services and subscription plans
echo.

echo 🧪 Ready for Postman Testing!
echo ==============================
echo 📖 Check POSTMAN_TEST_GUIDE.md for detailed testing instructions
echo 🔑 Test Accounts:
echo    Customer: customer@sweepro.com / customer123
echo    Maid: maid@sweepro.com / maid123
echo    Admin: admin@sweepro.com / admin123
echo.

echo 🚀 Starting server...
echo    Press Ctrl+C to stop the server
echo.

REM Start the server
npm start

pause
