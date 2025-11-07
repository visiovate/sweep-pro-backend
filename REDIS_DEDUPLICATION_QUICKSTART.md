# Redis Deduplication - Quick Start Guide

## ✅ What Was Implemented

A Redis-based deduplication system that prevents duplicate booking requests from being sent to the same maid when the server restarts.

## 🎯 Problem Solved

**Before:** Server restart → Duplicate booking requests sent to maids ❌

**After:** Server restart → Redis checks prevent duplicates ✅

## 🚀 Quick Start

### 1. Ensure Redis is Running

```bash
# Check if Redis is running
redis-cli ping
# Should return: PONG

# If not running, start Redis
redis-server
```

### 2. Start Your Server

```bash
npm run dev
```

You should see:
```
✅ Redis connected successfully
✅ Booking Deduplication Service initialized successfully
```

### 3. Test It

1. Create a booking request (automatic or manual)
2. Restart the server
3. The same booking request will NOT be sent again! 🎉

## 📋 Key Features

- ✅ **Prevents duplicate booking requests** to the same maid
- ✅ **Survives server restarts** (data stored in Redis)
- ✅ **Auto-expires** after 48 hours (configurable)
- ✅ **Fails gracefully** if Redis is down
- ✅ **Admin API** for monitoring and management

## 🔧 Configuration

### Default Settings
- **TTL:** 48 hours (172,800 seconds)
- **Key Format:** `booking:dedup:{customerId}:{maidId}:{date}`

### Change TTL (if needed)

In the code, change the TTL parameter:
```javascript
await bookingDeduplicationService.markAsProcessed(
  customerId,
  maidId,
  scheduledDate,
  24 * 60 * 60 // Change to 24 hours
);
```

## 📊 Admin API Endpoints

### Get Statistics
```bash
GET /api/booking-deduplication/stats
```

### Check if Duplicate
```bash
POST /api/booking-deduplication/check
{
  "customerId": "user123",
  "maidId": "maid456",
  "scheduledDate": "2024-11-05"
}
```

### Remove a Marker
```bash
DELETE /api/booking-deduplication/remove
{
  "customerId": "user123",
  "maidId": "maid456",
  "scheduledDate": "2024-11-05"
}
```

### Clear All Markers (Emergency)
```bash
POST /api/booking-deduplication/clear-all
```

## 🔍 Monitoring

### Check Redis Keys
```bash
redis-cli
> KEYS booking:dedup:*
> GET booking:dedup:user123:maid456:2024-11-05
```

### View Server Logs
Look for these messages:
- ✅ `Marked booking request as processed`
- 🚫 `Duplicate booking request prevented`

## ⚠️ Troubleshooting

### Redis Not Connected?
```bash
# Check Redis status
redis-cli ping

# Check Redis logs
tail -f /var/log/redis/redis-server.log

# Restart Redis
sudo service redis-server restart
```

### Still Getting Duplicates?
1. Verify Redis is running: `redis-cli ping`
2. Check server logs for Redis connection errors
3. Verify TTL hasn't expired: `redis-cli TTL booking:dedup:...`

### Need to Reset Everything?
```bash
# Clear all deduplication markers
curl -X POST http://localhost:3000/api/booking-deduplication/clear-all \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

## 📝 Files Modified

1. ✅ `src/services/bookingDeduplicationService.js` - NEW
2. ✅ `src/routes/bookingDeduplicationRoutes.js` - NEW
3. ✅ `src/controllers/automaticBookingController.js` - UPDATED
4. ✅ `src/services/automaticAssignmentService.js` - UPDATED
5. ✅ `src/controllers/bookingController.js` - UPDATED
6. ✅ `src/index.js` - UPDATED

## 🎓 How It Works

```
1. Booking Request Created
   ↓
2. Check Redis: "Has this been sent before?"
   ↓
3a. YES → Block duplicate ❌
3b. NO → Create booking ✅
   ↓
4. Mark in Redis with 48hr expiry
```

## 💡 Tips

- **Redis is already configured** in your project (used by BullMQ)
- **No additional setup needed** beyond ensuring Redis is running
- **Automatic cleanup** - Redis expires old keys automatically
- **Safe to restart** - Data persists in Redis

## 🆘 Need Help?

Check the full documentation: `BOOKING_DEDUPLICATION_SYSTEM.md`

---

**That's it! Your booking deduplication system is now active.** 🎉
