# Booking Request Deduplication System

## Overview

The Booking Request Deduplication System uses Redis to prevent duplicate booking requests from being sent to the same maid when the server restarts or when multiple requests are made in quick succession.

## Problem Statement

Previously, when the server restarted, it would re-send booking requests to maids even if those requests had already been sent. This caused:
- Duplicate notifications to maids
- Confusion about which booking request to respond to
- Database inconsistencies
- Poor user experience

## Solution

We implemented a Redis-based deduplication system that:
1. **Tracks sent booking requests** using a unique key format
2. **Prevents duplicates** by checking Redis before creating assignment requests
3. **Auto-expires** old entries after 48 hours (configurable)
4. **Survives server restarts** since data is stored in Redis

## Architecture

### Key Components

1. **bookingDeduplicationService.js** - Core service managing Redis operations
2. **automaticBookingController.js** - Updated to use deduplication
3. **automaticAssignmentService.js** - Updated to use deduplication
4. **bookingController.js** - Updated to use deduplication
5. **bookingDeduplicationRoutes.js** - Admin API endpoints

### Redis Key Format

```
booking:dedup:{customerId}:{maidId}:{YYYY-MM-DD}
```

Example:
```
booking:dedup:user123:maid456:2024-11-05
```

### Data Stored

Each key stores JSON data:
```json
{
  "customerId": "user123",
  "maidId": "maid456",
  "scheduledDate": "2024-11-05T09:00:00.000Z",
  "markedAt": "2024-11-04T13:00:00.000Z"
}
```

## How It Works

### 1. Creating a Booking Request

```javascript
// Check if duplicate
const isDuplicate = await bookingDeduplicationService.isDuplicate(
  customerId,
  maidId,
  scheduledDate
);

if (isDuplicate) {
  // Prevent duplicate - return error
  return res.status(409).json({
    success: false,
    message: 'Booking request already sent'
  });
}

// Create booking and assignment request...

// Mark as processed
await bookingDeduplicationService.markAsProcessed(
  customerId,
  maidId,
  scheduledDate,
  48 * 60 * 60 // 48 hours TTL
);
```

### 2. Atomic Check-and-Mark

For better performance, use the atomic operation:

```javascript
const canProceed = await bookingDeduplicationService.checkAndMark(
  customerId,
  maidId,
  scheduledDate,
  48 * 60 * 60 // TTL in seconds
);

if (!canProceed) {
  // Duplicate detected
  return;
}

// Proceed with booking creation...
```

## API Endpoints

### Get Statistics
```http
GET /api/booking-deduplication/stats
Authorization: Bearer {admin_token}
```

Response:
```json
{
  "success": true,
  "data": {
    "total": 15,
    "keys": [
      "user123:maid456:2024-11-05",
      "user789:maid456:2024-11-06"
    ]
  }
}
```

### Check Duplicate
```http
POST /api/booking-deduplication/check
Authorization: Bearer {admin_token}
Content-Type: application/json

{
  "customerId": "user123",
  "maidId": "maid456",
  "scheduledDate": "2024-11-05"
}
```

Response:
```json
{
  "success": true,
  "data": {
    "isDuplicate": true,
    "info": {
      "customerId": "user123",
      "maidId": "maid456",
      "scheduledDate": "2024-11-05T09:00:00.000Z",
      "markedAt": "2024-11-04T13:00:00.000Z"
    }
  }
}
```

### Remove Marker
```http
DELETE /api/booking-deduplication/remove
Authorization: Bearer {admin_token}
Content-Type: application/json

{
  "customerId": "user123",
  "maidId": "maid456",
  "scheduledDate": "2024-11-05"
}
```

### Clear All Markers (Use with Caution)
```http
POST /api/booking-deduplication/clear-all
Authorization: Bearer {admin_token}
```

## Configuration

### TTL (Time To Live)

Default: **48 hours** (172,800 seconds)

You can customize the TTL when marking a request:

```javascript
await bookingDeduplicationService.markAsProcessed(
  customerId,
  maidId,
  scheduledDate,
  24 * 60 * 60 // 24 hours
);
```

### Redis Connection

The service uses the existing Redis connection from `config/redis.js`. Ensure Redis is running and configured in your `.env` file:

```env
# Option 1: Redis URL
REDIS_URL=redis://default:password@hostname:port

# Option 2: Individual parameters
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=your_password
```

## Error Handling

The service is designed to **fail open** - if Redis is unavailable, booking requests will still be processed (without deduplication). This ensures the system remains operational even if Redis has issues.

```javascript
if (!this.redis) {
  console.warn('⚠️ Redis not initialized, allowing request without deduplication');
  return true; // Allow the request
}
```

## Testing

### Manual Testing

1. **Start Redis**:
   ```bash
   redis-server
   ```

2. **Start the server**:
   ```bash
   npm run dev
   ```

3. **Create a booking request** (via API or automatic scheduler)

4. **Restart the server**

5. **Verify** that duplicate requests are prevented

### Check Redis Keys

```bash
redis-cli
> KEYS booking:dedup:*
> GET booking:dedup:user123:maid456:2024-11-05
> TTL booking:dedup:user123:maid456:2024-11-05
```

## Monitoring

### View Statistics

Use the admin API to monitor deduplication:

```bash
curl -X GET http://localhost:3000/api/booking-deduplication/stats \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

### Redis Monitoring

```bash
redis-cli MONITOR
```

This shows all Redis commands in real-time.

## Troubleshooting

### Issue: Duplicates Still Occurring

**Possible Causes:**
1. Redis not running
2. Redis connection failed
3. TTL expired

**Solution:**
- Check Redis status: `redis-cli ping` (should return "PONG")
- Check server logs for Redis connection errors
- Verify TTL is appropriate for your use case

### Issue: Legitimate Requests Being Blocked

**Possible Causes:**
1. TTL too long
2. Marker not removed after cancellation

**Solution:**
- Reduce TTL to 24 hours
- Manually remove marker using admin API
- Clear all markers if needed (use with caution)

### Issue: Redis Memory Usage High

**Solution:**
- Reduce TTL
- Implement Redis eviction policy
- Monitor key count with stats endpoint

## Best Practices

1. **Set appropriate TTL**: 24-48 hours is recommended
2. **Monitor Redis memory**: Use Redis monitoring tools
3. **Handle Redis failures gracefully**: The service fails open by design
4. **Clean up old markers**: Redis auto-expires keys, but you can manually clear if needed
5. **Use atomic operations**: Prefer `checkAndMark()` over separate `isDuplicate()` and `markAsProcessed()`

## Future Enhancements

1. **Add booking cancellation hook** to auto-remove markers
2. **Implement Redis cluster** for high availability
3. **Add metrics and alerting** for duplicate prevention rate
4. **Create admin dashboard** for visualizing deduplication stats
5. **Add webhook notifications** when duplicates are prevented

## Related Files

- `src/services/bookingDeduplicationService.js` - Core service
- `src/routes/bookingDeduplicationRoutes.js` - API routes
- `src/controllers/automaticBookingController.js` - Automatic bookings
- `src/services/automaticAssignmentService.js` - Automatic assignments
- `src/controllers/bookingController.js` - Manual bookings
- `src/config/redis.js` - Redis configuration
- `src/index.js` - Service initialization

## Support

For issues or questions, please check:
1. Server logs for Redis connection status
2. Redis logs for any errors
3. Admin API endpoints for deduplication statistics
