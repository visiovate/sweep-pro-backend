# Simplified Notification System Documentation

## Overview

The Simplified Notification System is a production-ready, cost-effective notification solution that eliminates the complexity of BullMQ and Redis while maintaining all essential notification functionality. This system was designed to reduce infrastructure costs from ₹60,000-84,000/year to ₹0/year while providing reliable in-app notifications.

## Architecture

```
┌─────────────────┐
│   API Server    │
│  (Express.js)   │
└────────┬────────┘
         │
    ┌────┴────┐
    │         │
┌───▼─────┐ ┌─▼──────────┐
│ Database │ │ WebSocket  │
│(Prisma) │ │   (WS)     │
└─────────┘ └────────────┘
```

### Key Components

1. **SimplifiedNotificationService** - Core notification service
2. **NotificationErrorHandler** - Error handling and circuit breaker
3. **NotificationCleanupCron** - Automated database cleanup
4. **WebSocket Integration** - Real-time notification delivery
5. **Database Persistence** - Offline notification storage

## Cost Comparison

| System | Monthly Cost | Yearly Cost | Complexity |
|--------|-------------|-------------|------------|
| **Previous (BullMQ + Redis)** | ₹5,000-7,000 | ₹60,000-84,000 | High |
| **Simplified** | ₹0 | ₹0 | Low |

## Features

### Core Functionality
- ✅ Real-time in-app notifications via WebSocket
- ✅ Database persistence for offline users
- ✅ Role-based targeting (Admin, Maid, Customer)
- ✅ Comprehensive notification types (40+ types)
- ✅ Automatic cleanup of old notifications
- ✅ Error handling with circuit breaker
- ✅ Statistics and monitoring

### Notification Types

**Critical (Always Sent):**
- Booking confirmations
- Payment confirmations
- Maid assignments
- Service completions
- Subscription activations
- Assignment requests

**Important (Sent):**
- Booking reminders
- Payment failures
- Subscription expiring
- Issue reports
- User registrations

## File Structure

```
sweep-pro-backend/
├── src/
│   ├── services/
│   │   ├── simplifiedNotificationService.js  # Core notification service
│   │   └── notificationService.js            # WebSocket wrapper (updated)
│   ├── utils/
│   │   └── notificationErrorHandler.js       # Error handling & monitoring
│   ├── cron/
│   │   └── notificationCleanupCron.js        # Automated cleanup
│   ├── controllers/
│   │   └── notificationController.js         # API endpoints (updated)
│   ├── notifications/
│   │   └── events/
│   │       └── publishEvent.js               # Event publishing (updated)
│   └── index.js                              # Main server (updated)
```

## Usage

### Basic Notification Sending

```javascript
const simplifiedNotificationService = require('./services/simplifiedNotificationService');

// Send to specific user
await simplifiedNotificationService.sendToUser(userId, {
  type: 'BOOKING_CREATED',
  title: 'Booking Confirmed',
  message: 'Your booking has been created successfully',
  data: { bookingId: '123' }
});

// Send to all admins
await simplifiedNotificationService.sendToAdmins({
  type: 'SYSTEM_ALERT',
  title: 'System Maintenance',
  message: 'Scheduled maintenance at 2 AM'
});

// Send to all maids
await simplifiedNotificationService.sendToAllMaids({
  type: 'SHIFT_REMINDER',
  title: 'Shift Reminder',
  message: 'You have a shift tomorrow'
});
```

### Using Notification Type Methods

```javascript
// Booking notifications
await simplifiedNotificationService.notifyBookingCreated(booking);
await simplifiedNotificationService.notifyMaidAssigned(booking);
await simplifiedNotificationService.notifyServiceCompleted(booking);

// Payment notifications
await simplifiedNotificationService.notifyPaymentReceived(payment);
await simplifiedNotificationService.notifyPaymentFailed(payment);

// Subscription notifications
await simplifiedNotificationService.notifySubscriptionCreated(subscription);
await simplifiedNotificationService.notifySubscriptionCancelled(subscription, reason);

// Assignment notifications
await simplifiedNotificationService.notifyAssignmentRequest(assignmentRequest);
await simplifiedNotificationService.notifyAssignmentAccepted(assignmentRequest);
await simplifiedNotificationService.notifyAssignmentRejected(assignmentRequest);
```

### Using publishEvent (Backward Compatible)

```javascript
const { publishNotificationEvent } = require('./notifications/events/publishEvent');
const { NOTIFICATION_TOPICS } = require('./notifications/events/topics');

// Publish event (automatically processed by simplified service)
await publishNotificationEvent({
  topic: NOTIFICATION_TOPICS.BOOKING_CREATED,
  payload: { bookingId: '123' },
  dedupeKey: `booking-created-123`
});
```

## Error Handling

The system includes comprehensive error handling with a circuit breaker pattern:

```javascript
const notificationErrorHandler = require('./utils/notificationErrorHandler');

// Check error statistics
const stats = notificationErrorHandler.getErrorStats();
console.log(stats);
// {
//   totalErrors: 5,
//   errorCounts: { 'database timeout': 3, 'network error': 2 },
//   circuitBreaker: { isOpen: false, failureCount: 5 },
//   recentErrors: [...]
// }

// Check if circuit breaker is open
if (notificationErrorHandler.isCircuitOpen()) {
  console.log('Notifications temporarily disabled due to high failure rate');
}

// Reset circuit breaker manually
notificationErrorHandler.resetCircuitBreaker();
```

## Monitoring

### Health Check Endpoint

```bash
GET /api/notifications/health
```

Response:
```json
{
  "success": true,
  "data": {
    "service": "simplified",
    "stats": {
      "totalSent": 1250,
      "totalFailed": 5,
      "lastError": null,
      "lastErrorTime": null,
      "successRate": "99.60"
    },
    "errorStats": {
      "totalErrors": 5,
      "errorCounts": {},
      "circuitBreaker": {
        "isOpen": false,
        "failureCount": 0
      },
      "recentErrors": []
    },
    "timestamp": "2026-07-17T06:30:00.000Z"
  }
}
```

### Statistics

```javascript
const simplifiedNotificationService = require('./services/simplifiedNotificationService');

// Get notification statistics
const stats = simplifiedNotificationService.getStats();
console.log(stats);
// {
//   totalSent: 1250,
//   totalFailed: 5,
//   lastError: null,
//   lastErrorTime: null,
//   successRate: "99.60"
// }

// Reset statistics
simplifiedNotificationService.resetStats();
```

## Database Cleanup

The system includes an automated cleanup job that runs daily at 2 AM:

### Cleanup Rules

- **Read notifications**: Deleted after 90 days (except critical types)
- **Failed notifications**: Deleted after 30 days
- **Critical notifications** (payment, subscription): Deleted after 180 days
- **Outbox events**: Deleted after 30 days
- **Delivery records**: Deleted after 90 days

### Manual Cleanup

```javascript
const notificationCleanupCron = require('./cron/notificationCleanupCron');

// Run cleanup immediately
const result = await notificationCleanupCron.runNow();
console.log(result);
// {
//   lastRun: "2026-07-17T06:30:00.000Z",
//   notificationsDeleted: 150,
//   outboxEventsDeleted: 50,
//   deliveryRecordsDeleted: 75,
//   duration: 234,
//   error: null
// }
```

## Integration with Existing Systems

### Maid Assignment System (Unchanged)

The maid assignment system continues to use BullMQ and Redis as before. This is completely separate from the notification system:

```javascript
// Maid assignment still uses BullMQ
const { assignmentQueue } = require('./queues/assignmentQueue');
await assignmentQueue.add('assign-maid', { bookingId, maidId });
```

### WebSocket Integration

The existing WebSocket system continues to work for real-time delivery:

```javascript
// WebSocket delivery is handled by notificationService.js
// which wraps simplifiedNotificationService for database persistence
const notificationService = require('./services/notificationService');
await notificationService.sendToUser(userId, notification);
```

## Deployment

### Environment Variables

No additional environment variables required. The system uses existing database configuration.

### Startup Process

The simplified notification system starts automatically with the main API server:

```javascript
// In index.js
const notificationCleanupCron = require('./cron/notificationCleanupCron');
notificationCleanupCron.start(); // Starts daily cleanup at 2 AM
```

### Production Considerations

1. **Database Indexing**: Ensure proper indexes on `notification` table
2. **Monitoring**: Monitor notification success rates via health endpoint
3. **Cleanup**: Verify cleanup job runs successfully daily
4. **Error Handling**: Monitor circuit breaker status

## Testing

### Manual Testing

```javascript
// Test notification sending
const simplifiedNotificationService = require('./services/simplifiedNotificationService');

await simplifiedNotificationService.sendToUser('user-id', {
  type: 'TEST_NOTIFICATION',
  title: 'Test',
  message: 'This is a test notification'
});

// Check statistics
console.log(simplifiedNotificationService.getStats());
```

### API Testing

```bash
# Send test notification (Admin only)
POST /api/notifications/test
{
  "userId": "user-id",
  "type": "SYSTEM_ALERT",
  "title": "Test",
  "message": "Test notification"
}

# Check health
GET /api/notifications/health

# Get notification statistics
GET /api/notifications/stats
```

## Troubleshooting

### Notifications Not Appearing

1. Check WebSocket connection status
2. Verify database connection
3. Check error statistics via health endpoint
4. Verify circuit breaker is not open

### High Failure Rate

1. Check error statistics for common errors
2. Verify database performance
3. Check network connectivity
4. Consider increasing retry logic

### Database Bloat

1. Verify cleanup job is running
2. Check cleanup job logs
3. Manually run cleanup if needed
4. Adjust cleanup retention periods

## Migration from BullMQ System

### What Changed

- **Removed**: BullMQ queue system
- **Removed**: Redis dependency for notifications
- **Removed**: Separate notification workers
- **Removed**: Email service integration (can be added later if needed)
- **Kept**: WebSocket real-time delivery
- **Kept**: Database persistence
- **Kept**: All notification types
- **Kept**: Maid assignment BullMQ system (unchanged)

### Backward Compatibility

The system maintains backward compatibility with existing code:

- `publishNotificationEvent()` still works
- `notificationService` still works (now wraps simplified service)
- All notification methods still available
- WebSocket integration unchanged

### Rollback Plan

If issues arise, you can rollback by:

1. Revert `index.js` to use original `notificationService`
2. Revert `publishEvent.js` to original implementation
3. Start BullMQ workers again
4. Verify Redis connection

## Performance

### Expected Performance

- **Notification creation**: < 50ms
- **Bulk notifications**: < 500ms for 100 users
- **Database cleanup**: < 5 seconds for typical load
- **WebSocket delivery**: < 10ms per connected user

### Scalability

The system can handle:
- **Concurrent users**: 1000+
- **Notifications/day**: 10,000+
- **Database size**: Automatically managed by cleanup

## Security

- ✅ JWT-based WebSocket authentication
- ✅ Role-based access control
- ✅ Input validation on all endpoints
- ✅ SQL injection prevention (Prisma ORM)
- ✅ Rate limiting on API endpoints
- ✅ Circuit breaker prevents cascading failures

## Future Enhancements

### Optional Additions (When Budget Allows)

1. **Email Integration**: Add transactional email for critical notifications
2. **SMS Integration**: Add SMS for urgent notifications
3. **Push Notifications**: Add mobile push notifications
4. **Advanced Analytics**: Add detailed notification analytics
5. **A/B Testing**: Add notification content testing

### Email Integration Example

```javascript
// Future: Add email service
const emailService = require('./services/emailService');

await simplifiedNotificationService.sendToUser(userId, {
  type: 'PAYMENT_RECEIVED',
  title: 'Payment Received',
  message: 'Payment successful',
  channels: ['IN_APP', 'EMAIL'] // Add email channel
});
```

## Support

For issues or questions:
1. Check this documentation
2. Review error logs
3. Check health endpoint statistics
4. Verify database connection
5. Test with manual notification sending

## Summary

The Simplified Notification System provides:
- **Cost savings**: ₹60,000-84,000/year
- **Reliability**: Production-ready with error handling
- **Simplicity**: Easy to maintain and debug
- **Compatibility**: Works with existing systems
- **Scalability**: Handles current and future needs
- **Monitoring**: Built-in health checks and statistics

The system is production-ready and can be deployed immediately without additional infrastructure costs.
