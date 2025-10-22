# BullMQ Background Job Implementation for Sweepro

## 🎯 Overview

This implementation replaces **node-cron** with **BullMQ + Redis** to provide **24/7 automated maid assignment scheduling** that works even when the application is idle.

### Why BullMQ over Node-Cron?

| Feature | Node-Cron | BullMQ + Redis |
|---------|-----------|----------------|
| **Runs when app idle** | ❌ No | ✅ Yes |
| **Persistent jobs** | ❌ No | ✅ Yes |
| **Separate worker** | ❌ No | ✅ Yes |
| **Job retry** | ❌ Manual | ✅ Automatic |
| **Job monitoring** | ❌ Limited | ✅ Full dashboard |
| **Scalability** | ❌ Single instance | ✅ Multiple workers |
| **Job priority** | ❌ No | ✅ Yes |

---

## 🏗️ Architecture

### Components

1. **Main API Server** (`npm start`)
   - Express REST API
   - WebSocket connections
   - Schedules jobs into queue

2. **Background Worker** (`npm run worker`)
   - Standalone process
   - Processes jobs from queue
   - Runs 24/7 independently

3. **Redis**
   - Job queue storage
   - Shared between API and worker

4. **PostgreSQL**
   - Application database
   - Shared between API and worker

```
┌──────────────┐         ┌───────┐         ┌─────────────┐
│   Main API   │────────▶│ Redis │◀────────│   Worker    │
│   (Port 3000)│         │ Queue │         │   (24/7)    │
└──────────────┘         └───────┘         └─────────────┘
       │                                           │
       └───────────────┐       ┐───────────────────┘
                       ▼       ▼
                   ┌──────────────┐
                   │  PostgreSQL  │
                   └──────────────┘
```

---

## 📦 What Was Implemented

### 1. Core Infrastructure

**New Files:**
```
src/
├── config/
│   └── redis.js                    # Redis connection management
├── queues/
│   └── assignmentQueue.js          # BullMQ queue definition
├── workers/
│   └── assignmentWorker.js         # Background worker process
├── services/
│   └── jobScheduler.js             # Job scheduling logic
├── controllers/
│   └── queueController.js          # Queue management APIs
└── routes/
    └── queueRoutes.js              # Queue API routes
```

### 2. Modified Files

- `src/index.js` - Integrated BullMQ initialization
- `src/controllers/customerAssignmentController.js` - Added job scheduling hook
- `package.json` - Added BullMQ dependencies and worker script

### 3. Documentation

- `DEPLOYMENT.md` - Complete Render deployment guide
- `API_TESTING_GUIDE.md` - Postman API testing guide
- `.env.example` - Environment variable template
- `BULLMQ_IMPLEMENTATION.md` - This file

---

## 🚀 Quick Start

### Local Development

1. **Install Redis:**
```bash
# macOS
brew install redis
brew services start redis

# Windows WSL
sudo apt install redis-server
sudo service redis-server start
```

2. **Install Dependencies:**
```bash
npm install
```

3. **Configure Environment:**
```bash
cp .env.example .env
# Edit .env with your settings
```

4. **Run Database Migrations:**
```bash
npx prisma generate
npx prisma migrate dev
```

5. **Start Services:**
```bash
# Terminal 1 - Main API
npm run dev

# Terminal 2 - Background Worker
npm run worker:dev
```

6. **Test:**
```bash
# Health check
curl http://localhost:3000/api/queue/health
```

---

## 🔄 How It Works

### Assignment Scheduling Flow

```
1. Admin assigns maid to customer
   └─▶ Customer-maid assignment created in DB

2. Maid accepts the assignment
   └─▶ JobScheduler.onNewAssignment() triggered
       └─▶ Calculates when to send request (20 hours before service)
           └─▶ Creates job in BullMQ queue with delay

3. Background worker processes jobs
   └─▶ At scheduled time, worker creates assignment request
       └─▶ Maid receives notification
           └─▶ Maid accepts/rejects request

4. If rejected, goes to admin reassignment
   └─▶ Admin assigns new maid
       └─▶ Cycle repeats
```

### Job Types

| Job Type | Description | Trigger |
|----------|-------------|---------|
| `create-assignment-request` | Create single assignment request | Scheduled 20h before service |
| `process-all-assignments` | Check all customers | Hourly recurring job |
| `handle-expired-requests` | Mark expired requests | Every 30 minutes |
| `send-reminder` | Send notifications | On-demand |

---

## 🎛️ Queue Management APIs

### Admin APIs

All require admin authentication:

```bash
# Get queue statistics
GET /api/queue/stats

# Get all jobs
GET /api/queue/jobs

# Schedule all assignments
POST /api/queue/schedule-all

# Process immediately
POST /api/queue/process-now

# Schedule specific customer
POST /api/queue/schedule-customer
{
  "customerId": "user-id",
  "maidId": "maid-id",
  "timeSlot": "12.00"
}

# Clean old jobs
POST /api/queue/clean

# Retry failed job
POST /api/queue/retry/:jobId

# Pause/Resume queue
POST /api/queue/pause
POST /api/queue/resume
```

### Public APIs

```bash
# Health check
GET /api/queue/health
```

---

## 🔧 Configuration

### Environment Variables

Required:
```bash
DATABASE_URL=postgresql://...
REDIS_URL=redis://...
JWT_SECRET=your-secret
NODE_ENV=production
```

Optional:
```bash
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
ASSIGNMENT_REQUEST_HOURS_BEFORE=20
```

### Queue Settings

In `src/queues/assignmentQueue.js`:
```javascript
defaultJobOptions: {
  attempts: 3,              // Retry failed jobs 3 times
  backoff: {
    type: 'exponential',
    delay: 2000             // Start with 2s, double each retry
  },
  removeOnComplete: {
    count: 100,             // Keep last 100 completed jobs
    age: 24 * 3600          // Remove after 24 hours
  },
  removeOnFail: {
    count: 50,              // Keep last 50 failed jobs
    age: 7 * 24 * 3600      // Remove after 7 days
  }
}
```

### Worker Settings

In `src/workers/assignmentWorker.js`:
```javascript
const worker = new Worker('maid-assignment', processJob, {
  connection,
  concurrency: 5,           // Process 5 jobs simultaneously
  limiter: {
    max: 10,                // Max 10 jobs
    duration: 1000          // per second
  }
});
```

---

## 📊 Monitoring

### Check Queue Health

```bash
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
      "active": 1,
      "completed": 25,
      "failed": 0,
      "delayed": 5
    }
  }
}
```

### View Queue Stats

```bash
curl https://your-app.onrender.com/api/queue/stats \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

### View All Jobs

```bash
curl https://your-app.onrender.com/api/queue/jobs \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

---

## 🚢 Deployment to Render

### Prerequisites

1. Redis instance (Render Redis or external)
2. PostgreSQL database
3. GitHub repository

### Deployment Steps

#### 1. Create Redis

1. Render Dashboard → New + → Redis
2. Name: `sweepro-redis`
3. Copy the Redis URL

#### 2. Deploy Main API

1. Render Dashboard → New + → Web Service
2. Connect GitHub repo
3. **Build Command:** `npm install && npx prisma generate && npx prisma migrate deploy`
4. **Start Command:** `npm start`
5. Add environment variables:
   ```
   DATABASE_URL=<postgres_url>
   REDIS_URL=<redis_url>
   JWT_SECRET=<secret>
   NODE_ENV=production
   ```

#### 3. Deploy Background Worker

1. Render Dashboard → New + → **Background Worker** (NOT Web Service!)
2. Connect same GitHub repo
3. **Build Command:** `npm install && npx prisma generate`
4. **Start Command:** `npm run worker`
5. Add **SAME** environment variables as main service

### Verification

1. Check worker logs:
   ```
   ✅ Assignment Worker is ready and waiting for jobs
   ✅ Redis connected successfully
   ```

2. Test health check:
   ```bash
   curl https://your-app.onrender.com/api/queue/health
   ```

---

## 🧪 Testing

### Scenario 1: Basic Job Scheduling

```bash
# 1. Login as admin
POST /api/auth/login
{
  "email": "admin@sweepro.com",
  "password": "admin123"
}

# 2. Schedule all assignments
POST /api/queue/schedule-all
Authorization: Bearer <token>

# 3. Check queue
GET /api/queue/jobs
Authorization: Bearer <token>
```

### Scenario 2: Complete Assignment Flow

```bash
# 1. Admin assigns maid to customer
POST /api/admin/customer-assignments
{
  "customerId": "customer-id",
  "maidId": "maid-id"
}

# 2. Maid accepts (automatically schedules background jobs)
POST /api/assignments/:id/accept

# 3. Verify jobs were scheduled
GET /api/queue/jobs
```

### Scenario 3: Manual Processing

```bash
# Trigger immediate processing of all assignments
POST /api/queue/process-now
Authorization: Bearer <admin_token>
```

---

## ⚠️ Troubleshooting

### Issue: Worker not processing jobs

**Check:**
```bash
# 1. Is worker running?
# Check Render dashboard → sweepro-worker → Logs

# 2. Is Redis accessible?
curl https://your-app.onrender.com/api/queue/health

# 3. Are jobs in queue?
GET /api/queue/stats
```

**Solution:**
- Restart background worker in Render
- Verify REDIS_URL is correct
- Check worker logs for errors

### Issue: Jobs stuck in "waiting"

**Reason:** Worker is not running or can't connect to Redis

**Solution:**
```bash
# Restart worker
Render Dashboard → sweepro-worker → Manual Deploy → Deploy Latest Commit
```

### Issue: Redis connection failed

**Check:**
```bash
# Test Redis URL
redis-cli -u <REDIS_URL> ping
```

**Solution:**
- Verify REDIS_URL is correct in both services
- Check Redis instance is running
- Ensure Redis and services are in same region

---

## 📚 Additional Resources

- **Deployment Guide**: See `DEPLOYMENT.md`
- **API Testing**: See `API_TESTING_GUIDE.md`
- **BullMQ Docs**: https://docs.bullmq.io/
- **Render Docs**: https://render.com/docs

---

## 🎉 Benefits

### Before (Node-Cron)
- ❌ Stops when app is idle
- ❌ No job persistence
- ❌ Manual retry needed
- ❌ No monitoring
- ❌ Single point of failure

### After (BullMQ + Redis)
- ✅ Runs 24/7 independently
- ✅ Persistent job queue
- ✅ Automatic retry (3 attempts)
- ✅ Full monitoring dashboard
- ✅ Scalable with multiple workers
- ✅ Scheduled jobs with millisecond precision
- ✅ Job prioritization
- ✅ Failed job recovery

---

## 📝 Summary

This implementation provides a **production-ready, scalable, and reliable** background job processing system that:

1. **Automatically schedules** maid assignment requests 20 hours before service time
2. **Runs 24/7** even when the main application is idle
3. **Handles failures** with automatic retry and monitoring
4. **Scales easily** by adding more worker instances
5. **Provides visibility** through comprehensive APIs and logs

The system is now **fully automated** and requires **no manual intervention** for daily operations! 🚀

---

**Need Help?** Check `DEPLOYMENT.md` for detailed deployment instructions or `API_TESTING_GUIDE.md` for testing procedures.
