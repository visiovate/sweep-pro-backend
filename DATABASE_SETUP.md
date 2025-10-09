# Database Setup Guide

## Quick Fix for Current Errors

The errors you're seeing are due to database connection issues. Here's how to fix them:

### 1. Create Environment File

Copy the `.env.example` file to `.env`:

```bash
cp .env.example .env
```

### 2. Configure Database URL

Edit the `.env` file and update the `DATABASE_URL` with your actual database connection string:

```env
# For local PostgreSQL
DATABASE_URL="postgresql://username:password@localhost:5432/sweepro_db"

# For Neon (your current setup)
DATABASE_URL="postgresql://username:password@ep-bold-hall-a4oqwqjg-pooler.us-east-1.aws.neon.tech:5432/database_name"
```

### 3. Database Connection Options

#### Option A: Fix Neon Connection
If you want to continue using Neon:
1. Check your Neon dashboard for the correct connection string
2. Ensure your database is running and accessible
3. Verify your credentials are correct

#### Option B: Use Local PostgreSQL
1. Install PostgreSQL locally
2. Create a database named `sweepro_db`
3. Update the `DATABASE_URL` in `.env` file

#### Option C: Use Docker PostgreSQL
```bash
docker run --name sweepro-postgres -e POSTGRES_PASSWORD=password -e POSTGRES_DB=sweepro_db -p 5432:5432 -d postgres:13
```

Then use: `DATABASE_URL="postgresql://postgres:password@localhost:5432/sweepro_db"`

### 4. Initialize Database

After setting up the database connection:

```bash
# Generate Prisma client
npm run prisma:generate

# Run migrations
npm run prisma:migrate

# Seed the database (optional)
npm run prisma:seed
```

### 5. Test the Connection

Start the server:
```bash
npm run dev
```

You should see:
- ✅ Database connected successfully
- ✅ Database initialized successfully  
- ✅ Automatic service scheduler initialized

## Error Fixes Applied

### 1. Database Connection Handling
- Added robust error handling for database connections
- Created retry logic for failed connections
- Added graceful degradation when database is unavailable

### 2. AutomaticServiceScheduler Fixes
- Fixed undefined `findMany` error by adding proper Prisma client initialization
- Added database availability checks before executing queries
- Wrapped all database operations in error handling

### 3. Buffer Period Functionality
- Verified BufferPeriod model exists in schema
- Updated all buffer-related queries to use proper error handling
- Added proper database client management

## Environment Variables Required

```env
DATABASE_URL="your-database-connection-string"
JWT_SECRET="your-jwt-secret"
PORT=3000
NODE_ENV=development
```

## Troubleshooting

### Error: "Can't reach database server"
- Check if your database server is running
- Verify the connection string is correct
- Check firewall settings
- For Neon: verify your account and database status

### Error: "Prisma client not initialized"
- Ensure `.env` file exists with correct `DATABASE_URL`
- Run `npm run prisma:generate`
- Restart the server

### Error: "Database connection not available"
- Check your internet connection (for cloud databases)
- Verify database credentials
- Try connecting with a database client tool first

## Next Steps

1. Set up your `.env` file with the correct database URL
2. Run the Prisma commands to set up the database
3. Start the server and verify all services are working
4. The buffer period functionality should now work correctly

The application now has robust error handling and will continue running even if the database is temporarily unavailable, with clear error messages to help diagnose connection issues.
