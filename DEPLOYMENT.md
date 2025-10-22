# Sweepro Backend Deployment Guide with BullMQ + Redis

This guide covers deploying the Sweepro backend application to Render.com with BullMQ background workers for automated maid assignment scheduling.

## 📋 Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Prerequisites](#prerequisites)
3. [Redis Setup on Render](#redis-setup-on-render)
4. [Main Application Deployment](#main-application-deployment)
5. [Background Worker Deployment](#background-worker-deployment)
6. [Environment Variables](#environment-variables)
7. [Testing the Deployment](#testing-the-deployment)
8. [Monitoring & Troubleshooting](#monitoring--troubleshooting)
9. [Local Development Setup](#local-development-setup)

---

## 🏗️ Architecture Overview

The Sweepro backend consists of **TWO separate services**:

### 1. **Main API Server** (`npm start`)
- Handles all HTTP requests (REST APIs)
- Manages WebSocket connections
- Schedules jobs into BullMQ queues
- **Does NOT process background jobs**

### 2. **Background Worker** (`npm run worker`)
- Runs 24/7 independently
- Processes jobs from BullMQ queues
- Sends maid assignment requests 20 hours before service time
- Handles expired request cleanup
- **Operates even when the main app is idle**

```
┌─────────────────┐         ┌──────────┐         ┌────────────────────┐
│                 │         │          │         │                    │
│  Main API       │────────▶│  Redis   │◀────────│  Background Worker │
│  Server         │         │  Queue   │         │  (24/7 Running)    │
│  (Web Service)  │         │          │         │  (Background)      │
│                 │         └──────────┘         │                    │
└─────────────────┘                              └────────────────────┘
         │                                                │
         │                                                │
         ▼                                                ▼
  ┌──────────────┐                              ┌──────────────┐
  │  PostgreSQL  │                              │  PostgreSQL  │
  │  Database    │                              │  Database    │
  └──────────────┘                              └──────────────┘
         (Same database for both services)
```

---

## ✅ Prerequisites

Before deployment, ensure you have:

1. **Render.com account** (Free tier works)
2. **GitHub repository** with your code pushed
3. **PostgreSQL database** (can be created on Render)
4. **Redis instance** (required - see next section)

---

## 🔴 Redis Setup on Render

### Option 1: Render Redis (Recommended)

1. **Go to Render Dashboard** → Click **"New +"** → Select **"Redis"**

2. **Configure Redis Instance:**
   - **Name**: `sweepro-redis`
   - **Region**: Select same region as your services
   - **Plan**: Free (512 MB) or Starter ($10/month for persistence)
   - Click **"Create Redis"**

3. **Get Redis URL:**
   - After creation, go to the Redis instance
   - Copy the **"External Redis URL"** (looks like: `redis://red-xxxxx:6379`)
   - Save this - you'll need it for both services

### Option 2: External Redis (Upstash, Redis Cloud, etc.)

If using external Redis provider:
- Sign up at [Upstash](https://upstash.com/) or [Redis Cloud](https://redis.com/cloud/)
- Create a new Redis database
- Copy the connection URL
- Use this URL in both services

---

## 🚀 Main Application Deployment

### Step 1: Create Web Service

1. **Go to Render Dashboard** → Click **"New +"** → Select **"Web Service"**

2. **Connect Repository:**
   - Connect your GitHub/GitLab account
   - Select your `sweepro` repository
   - Select the `sweep-pro-backend` directory (if monorepo)

3. **Configure Web Service:**
   ```
   Name: sweepro-backend
   Region: [Choose your region]
   Branch: main
   Runtime: Node
   Build Command: npm install && npx prisma generate && npx prisma migrate deploy
   Start Command: npm start
   Instance Type: Free (or higher)
   ```

### Step 2: Add Environment Variables

Go to **Environment** tab and add:

```bash
# Database
DATABASE_URL=<your_postgresql_connection_string>

# Redis (from previous step)
REDIS_URL=<your_redis_url>

# Server
PORT=3000
NODE_ENV=production

# JWT
JWT_SECRET=<generate_a_strong_random_secret>

# Razorpay
RAZORPAY_TEST_KEY_ID=<your_key>
RAZORPAY_TEST_KEY_SECRET=<your_secret>

# CORS (Add your frontend URL)
CORS_ORIGIN=https://your-frontend-domain.com
```

### Step 3: Deploy

- Click **"Create Web Service"**
- Wait for deployment to complete (5-10 minutes)
- Check logs for any errors

---

## ⚙️ Background Worker Deployment

**CRITICAL:** The worker must run as a **Background Worker**, not a Web Service!

### Step 1: Create Background Worker

1. **Go to Render Dashboard** → Click **"New +"** → Select **"Background Worker"**

2. **Connect Same Repository:**
   - Select the same repository as main app
   - Select the `sweep-pro-backend` directory

3. **Configure Background Worker:**
   ```
   Name: sweepro-worker
   Region: [Same region as main app and Redis]
   Branch: main
   Runtime: Node
   Build Command: npm install && npx prisma generate
   Start Command: npm run worker
   Instance Type: Free (or higher)
   ```

### Step 2: Add Environment Variables

Go to **Environment** tab and add **THE SAME** environment variables as the main service:

```bash
# Database (SAME as main service)
DATABASE_URL=<your_postgresql_connection_string>

# Redis (SAME as main service)
REDIS_URL=<your_redis_url>

# Node Environment
NODE_ENV=production

# JWT
JWT_SECRET=<same_as_main_service>
```

**Important:** The worker needs access to:
- Same **PostgreSQL** database
- Same **Redis** instance
- Same **JWT_SECRET** (for consistency)

### Step 3: Deploy Worker

- Click **"Create Background Worker"**
- Wait for deployment
- Check logs to verify worker started:
  ```
  ✅ Assignment Worker is ready and waiting for jobs
  ✅ Redis connected successfully
  ```

---

## 📝 Environment Variables

### Required Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://user:pass@host:5432/db` |
| `REDIS_URL` | Redis connection string | `redis://red-xxx:6379` |
| `JWT_SECRET` | Secret key for JWT tokens | `your-secret-key-min-32-chars` |
| `NODE_ENV` | Environment mode | `production` |
| `PORT` | Server port (Web Service only) | `3000` |

### Optional Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `REDIS_HOST` | Redis host (if not using URL) | `localhost` |
| `REDIS_PORT` | Redis port | `6379` |
| `REDIS_PASSWORD` | Redis password | - |
| `ASSIGNMENT_REQUEST_HOURS_BEFORE` | Hours before service | `20` |
| `CORS_ORIGIN` | Frontend URL | `*` |

---

## 🧪 Testing the Deployment

### 1. Test Main API

```bash
# Health check
curl https://your-app.onrender.com/health

# Redis/Queue health check
curl https://your-app.onrender.com/api/queue/health
```

Expected response:
```json
{
  "success": true,
  "data": {
    "redis": "healthy",
    "queue": "healthy",
    "stats": {
      "waiting": 0,
      "active": 0,
      "completed": 5,
      "failed": 0,
      "delayed": 10
    }
  }
}
```

### 2. Test Worker is Running

Check worker logs in Render dashboard:
```
✅ Assignment Worker is ready and waiting for jobs
🔄 Worker processing job xxx: process-all-assignments
✅ Job xxx completed successfully
```

### 3. Test Job Scheduling

Use Postman or curl:

```bash
# Login as admin first to get token
curl -X POST https://your-app.onrender.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@example.com", "password": "password"}'

# Get queue stats (use token from login)
curl https://your-app.onrender.com/api/queue/stats \
  -H "Authorization: Bearer YOUR_TOKEN"

# Trigger manual processing
curl -X POST https://your-app.onrender.com/api/queue/process-now \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### 4. Verify Assignment Creation

After 20 hours before a customer's service time, check:
- Assignment requests are created in database
- Maid receives notification
- Jobs appear in queue stats

---

## 📊 Monitoring & Troubleshooting

### Monitoring Queue

Access queue dashboard APIs (admin only):

```bash
# Get queue statistics
GET /api/queue/stats

# Get all jobs
GET /api/queue/jobs

# Check queue health
GET /api/queue/health
```

### Common Issues

#### ❌ Worker not processing jobs

**Symptoms:**
- Jobs stuck in "waiting" state
- No worker logs

**Solutions:**
1. Check worker is running in Render dashboard
2. Verify Redis URL is correct in worker environment
3. Check worker logs for errors
4. Restart background worker

#### ❌ Redis connection failed

**Symptoms:**
```
❌ Redis connection failed
⚠️ Redis connection failed. BullMQ features will not work.
```

**Solutions:**
1. Verify `REDIS_URL` is correct
2. Ensure Redis instance is running
3. Check Redis is in same region
4. Test Redis connection:
   ```bash
   redis-cli -u <REDIS_URL> ping
   ```

#### ❌ Jobs not being created

**Symptoms:**
- No jobs in queue
- Assignments not sent

**Solutions:**
1. Check if repeating jobs are scheduled:
   ```bash
   GET /api/queue/jobs
   ```
2. Manually trigger processing:
   ```bash
   POST /api/queue/process-now
   ```
3. Verify customer-maid assignments exist in database
4. Check customer has active subscription

#### ❌ Database connection errors

**Symptoms:**
```
Error: Can't reach database server
```

**Solutions:**
1. Verify `DATABASE_URL` is correct
2. Run Prisma migrations:
   ```bash
   npx prisma migrate deploy
   ```
3. Check PostgreSQL is running
4. Ensure both services use same DATABASE_URL

### Checking Logs

**Main App Logs:**
```
Render Dashboard → sweepro-backend → Logs
```

**Worker Logs:**
```
Render Dashboard → sweepro-worker → Logs
```

**What to look for:**
- ✅ Successful job completions
- 🔄 Job processing logs
- ❌ Error messages
- 📋 Job creation logs

---

## 💻 Local Development Setup

### 1. Install Redis Locally

**macOS (Homebrew):**
```bash
brew install redis
brew services start redis
```

**Windows (WSL or Memurai):**
```bash
# Using WSL
sudo apt install redis-server
sudo service redis-server start

# Or download Memurai: https://www.memurai.com/
```

**Linux:**
```bash
sudo apt install redis-server
sudo systemctl start redis
```

### 2. Install Dependencies

```bash
cd sweep-pro-backend
npm install
```

### 3. Setup Environment

```bash
cp .env.example .env
# Edit .env with your local settings
```

**Local `.env`:**
```bash
DATABASE_URL="postgresql://user:password@localhost:5432/sweepro"
REDIS_HOST=localhost
REDIS_PORT=6379
JWT_SECRET=local-dev-secret
NODE_ENV=development
PORT=3000
```

### 4. Run Database Migrations

```bash
npx prisma generate
npx prisma migrate dev
```

### 5. Start Services Locally

**Terminal 1 - Main App:**
```bash
npm run dev
```

**Terminal 2 - Worker:**
```bash
npm run worker:dev
```

**Terminal 3 - Test Queue:**
```bash
# Login and get token
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@example.com", "password": "password"}'

# Check queue health
curl http://localhost:3000/api/queue/health
```

---

## 🎯 Best Practices

### 1. Keep Services in Same Region
- Main app, worker, Redis, and PostgreSQL should all be in the same region
- Reduces latency and costs

### 2. Monitor Queue Size
- Set up alerts for queue size
- Clean old jobs regularly

### 3. Scale Workers
- If queue grows too large, add more worker instances
- Each worker processes jobs concurrently

### 4. Database Connection Pooling
- Both services use same database
- Ensure connection limits aren't exceeded

### 5. Error Handling
- Jobs retry 3 times automatically
- Failed jobs are kept for 7 days for debugging

---

## 📚 Additional Resources

- [Render Documentation](https://render.com/docs)
- [BullMQ Documentation](https://docs.bullmq.io/)
- [Redis Documentation](https://redis.io/documentation)
- [Prisma Documentation](https://www.prisma.io/docs)

---

## 🆘 Support

If you encounter issues:

1. Check logs in Render dashboard
2. Verify environment variables
3. Test Redis connection
4. Review this guide
5. Check worker is running

For urgent issues:
- Check worker logs first
- Verify Redis is accessible
- Manually trigger jobs via API

---

## ✅ Deployment Checklist

- [ ] Redis instance created and running
- [ ] PostgreSQL database created
- [ ] Main web service deployed
- [ ] Background worker deployed
- [ ] Environment variables set on both services
- [ ] Redis URL same on both services
- [ ] Database URL same on both services
- [ ] Health check passing
- [ ] Queue health check passing
- [ ] Worker logs show "ready and waiting"
- [ ] Test job scheduling works
- [ ] Verify assignment requests created

---

**Your system is now running 24/7 with automated background job processing! 🎉**
