# End-to-End Notification System Implementation

## Overview

This document describes the comprehensive notification system implemented for the Sweep-Pro application, supporting real-time notifications for three user types: **Customer**, **Admin**, and **Maid**.

## Architecture

### Components

1. **Notification Service** (`src/services/notificationService.js`)
   - WebSocket-based real-time notification delivery
   - Role-specific client management (Admin, Maid, Customer)
   - Database persistence for offline users
   - Connection health monitoring

2. **Notification Enhancements** (`src/services/notificationEnhancements.js`)
   - Extended notification methods for specific workflows
   - Assignment request notifications
   - Task completion notifications
   - Performance and attendance alerts

3. **Notification Controller** (`src/controllers/notificationController.js`)
   - RESTful API endpoints for notification management
   - Advanced filtering and pagination
   - Bulk operations support

4. **Notification Scheduler** (`src/scheduler/notificationScheduler.js`)
   - Automated scheduled notifications
   - 13 different scheduled jobs running at various intervals
   - Reminder and alert systems

5. **Notification Templates** (`src/utils/notificationTemplates.js`)
   - Centralized notification templates
   - Multi-language support (English, Hindi)
   - Role-specific message formatting

## Notification Types

### Booking Lifecycle (15 types)
- `BOOKING_CREATED` - New booking confirmation
- `BOOKING_CONFIRMED` - Booking payment confirmed
- `MAID_ASSIGNED` - Maid assigned to booking
- `SERVICE_ASSIGNED` - Service assigned to maid
- `ASSIGNMENT_REQUEST` - Assignment request sent to maid
- `ASSIGNMENT_ACCEPTED` - Maid accepted assignment
- `ASSIGNMENT_REJECTED` - Maid rejected assignment
- `ASSIGNMENT_EXPIRED` - Assignment request expired
- `BOOKING_APPROACHING` - Service starting soon (2-4 hours)
- `MAID_ARRIVED` - Maid arrived at location
- `SERVICE_STARTED` - Service started
- `SERVICE_COMPLETED` - Service completed
- `BOOKING_CANCELLED` - Booking cancelled
- `BOOKING_RESCHEDULED` - Booking rescheduled
- `BOOKING_REMINDER` - Reminder 24 hours before

### Payment (6 types)
- `PAYMENT_RECEIVED` - Payment successful
- `PAYMENT_SUCCESS` - Payment confirmed
- `PAYMENT_FAILED` - Payment failed
- `PAYMENT_PENDING` - Payment pending
- `PAYMENT_REMINDER` - Payment reminder
- `PAYMENT_OVERDUE` - Payment overdue

### Subscription (12 types)
- `SUBSCRIPTION_CREATED` - New subscription activated
- `SUBSCRIPTION_EXPIRING` - Subscription expiring soon
- `SUBSCRIPTION_RENEWED` - Subscription renewed
- `SUBSCRIPTION_CANCELLED` - Subscription cancelled
- `SUBSCRIPTION_EXPIRED` - Subscription expired
- `SUBSCRIPTION_PAUSED` - Subscription paused
- `SUBSCRIPTION_RESUMED` - Subscription resumed
- `MONTHLY_CYCLE_STARTED` - New monthly cycle started
- `MONTHLY_CYCLE_COMPLETED` - Monthly cycle completed
- `CYCLE_COMPLETED` - Subscription cycle completed
- `MONTHLY_SERVICES_SCHEDULED` - Monthly services scheduled
- `BUFFER_PERIOD_*` - Buffer period notifications (6 types)

### Task Management (5 types)
- `TASK_STARTED` - Task started by maid
- `TASK_COMPLETED` - Task completed
- `ALL_TASKS_COMPLETED` - All tasks completed
- `VERIFICATION_REQUIRED` - Customer verification required
- `TASK_ISSUE_REPORTED` - Issue reported for task

### Maid Management (8 types)
- `MAID_STATUS_CHANGED` - Maid status updated
- `DOCUMENT_VERIFIED` - Document verification status
- `PERFORMANCE_ALERT` - Performance alert
- `LOW_PERFORMANCE_WARNING` - Low performance warning
- `ATTENDANCE_ALERT` - Attendance alert
- `MISSED_CHECK_IN` - Missed check-in alert
- `MAID_CHECK_IN` - Check-in successful
- `MAID_CHECK_OUT` - Check-out successful
- `SHIFT_REMINDER` - Shift reminder

### Customer-Maid Assignment (3 types)
- `CUSTOMER_ASSIGNMENT_REQUEST` - Permanent assignment request
- `CUSTOMER_ASSIGNMENT_ACCEPTED` - Assignment accepted
- `CUSTOMER_ASSIGNMENT_REJECTED` - Assignment rejected

### Feedback (4 types)
- `FEEDBACK_REQUEST` - Request for feedback
- `FEEDBACK_RECEIVED` - Feedback received
- `POSITIVE_FEEDBACK` - Positive rating received
- `NEGATIVE_FEEDBACK` - Negative rating received

### Issues (2 types)
- `ISSUE_REPORTED` - Issue reported
- `ISSUE_RESOLVED` - Issue resolved

### System (5 types)
- `SYSTEM_MAINTENANCE` - System maintenance notification
- `EMERGENCY_ALERT` - Emergency alert
- `SYSTEM_ALERT` - System alert
- `NEW_SERVICE_AVAILABLE` - New service available
- `PROMOTIONAL_OFFER` - Promotional offer
- `DAILY_SUMMARY` - Daily summary for admins

## API Endpoints

### User Endpoints

#### Get Notifications
```http
GET /api/notifications
Authorization: Bearer <token>
Query Parameters:
  - page: number (default: 1)
  - limit: number (default: 20)
  - read: boolean
  - type: NotificationType
  - priority: string
  - startDate: ISO date
  - endDate: ISO date
  - sortBy: string (default: 'createdAt')
  - sortOrder: 'asc' | 'desc' (default: 'desc')
```

#### Get Unread Notifications
```http
GET /api/notifications/unread
Authorization: Bearer <token>
```

#### Get Unread Count
```http
GET /api/notifications/unread/count
Authorization: Bearer <token>
```

#### Mark as Read
```http
PATCH /api/notifications/:id/read
Authorization: Bearer <token>
```

#### Mark Multiple as Read
```http
PATCH /api/notifications/read-multiple
Authorization: Bearer <token>
Body: { notificationIds: string[] }
```

#### Mark All as Read
```http
PATCH /api/notifications/read-all
Authorization: Bearer <token>
```

#### Delete Notification
```http
DELETE /api/notifications/:id
Authorization: Bearer <token>
```

#### Bulk Delete
```http
DELETE /api/notifications/bulk/delete
Authorization: Bearer <token>
Body: { notificationIds: string[] }
```

#### Clear Read Notifications
```http
DELETE /api/notifications/bulk/clear-read
Authorization: Bearer <token>
```

### Admin Endpoints

#### Get Statistics
```http
GET /api/notifications/admin/stats
Authorization: Bearer <admin-token>
Query Parameters:
  - timeframe: '24h' | '7d' | '30d'
  - userRole: 'CUSTOMER' | 'MAID' | 'ADMIN'
```

#### Get Connection Health
```http
GET /api/notifications/admin/health
Authorization: Bearer <admin-token>
```

#### Send Test Notification
```http
POST /api/notifications/admin/test
Authorization: Bearer <admin-token>
Body: {
  userId: string,
  type: NotificationType,
  title: string,
  message: string,
  data: object
}
```

#### Send Broadcast
```http
POST /api/notifications/admin/broadcast
Authorization: Bearer <admin-token>
Body: {
  type: NotificationType,
  title: string,
  message: string,
  data: object,
  targetRole?: 'CUSTOMER' | 'MAID' | 'ADMIN'
}
```

#### Send Maintenance Notification
```http
POST /api/notifications/admin/maintenance
Authorization: Bearer <admin-token>
Body: {
  startTime: string,
  endTime: string,
  description: string
}
```

#### Send Emergency Alert
```http
POST /api/notifications/admin/emergency
Authorization: Bearer <admin-token>
Body: {
  alertType: string,
  message: string,
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
}
```

## WebSocket Integration

### Connection
```javascript
const ws = new WebSocket('ws://localhost:5000');

ws.onopen = () => {
  // Authenticate
  ws.send(JSON.stringify({
    type: 'auth',
    token: '<jwt-token>'
  }));
};

ws.onmessage = (event) => {
  const notification = JSON.parse(event.data);
  
  if (notification.type === 'auth_success') {
    console.log('Authenticated:', notification.user);
  } else {
    // Handle notification
    console.log('New notification:', notification);
  }
};
```

### Heartbeat
```javascript
// Send ping every 30 seconds
setInterval(() => {
  ws.send(JSON.stringify({ type: 'ping' }));
}, 30000);
```

## Scheduled Jobs

### Job Schedule

| Job | Frequency | Description |
|-----|-----------|-------------|
| Booking Reminders | Every hour | Send reminders 24 hours before booking |
| Booking Approaching | Every 30 min | Alert 2-4 hours before service |
| Overdue Bookings | Every 15 min | Check for overdue bookings |
| Assignment Expiry | Every 10 min | Check expired assignment requests |
| Payment Reminders | Every 6 hours | Remind pending payments |
| Subscription Expiry | Daily 9 AM | Remind expiring subscriptions |
| Buffer Period | Daily 8 AM | Buffer period reminders |
| Feedback Requests | Every 2 hours | Request feedback for completed services |
| Attendance Alerts | Daily 9:30 AM | Check missed check-ins |
| Performance Alerts | Weekly Mon 10 AM | Send performance alerts |
| Shift Reminders | Hourly 7 AM-8 PM | Remind upcoming shifts |
| Daily Summary | Daily 6 PM | Send summary to admins |
| Cleanup | Daily 2 AM | Delete old notifications (90+ days) |

## Usage Examples

### Sending Notifications in Code

#### Booking Created
```javascript
const notificationService = require('./services/notificationService');

await notificationService.notifyBookingCreated(booking);
```

#### Assignment Request
```javascript
const notificationEnhancements = require('./services/notificationEnhancements');

await notificationEnhancements.notifyAssignmentRequestSent(
  assignmentRequest,
  booking,
  maid
);
```

#### Task Completed
```javascript
await notificationEnhancements.notifyTaskCompleted(
  taskCompletion,
  booking,
  task
);
```

### Using Templates
```javascript
const { getNotificationTemplate } = require('./utils/notificationTemplates');

const template = getNotificationTemplate(
  'BOOKING_CREATED',
  'customer',
  'en',
  {
    serviceName: 'House Cleaning',
    scheduledAt: new Date()
  }
);

console.log(template.title); // "Booking Confirmed"
console.log(template.message); // "Your booking for House Cleaning..."
```

## Multi-Language Support

The system supports English (en) and Hindi (hi) languages. To add more languages:

1. Add language templates in `notificationTemplates.js`
2. Use the `getNotificationTemplate` function with the language code
3. Store user language preference in the database

Example:
```javascript
const userLanguage = user.languagePreferences[0] || 'en';
const template = getNotificationTemplate(type, role, userLanguage, data);
```

## Database Schema

### Notification Model
```prisma
model Notification {
  id           String           @id @default(uuid())
  userId       String
  type         NotificationType
  title        String
  message      String
  data         Json?
  read         Boolean          @default(false)
  readAt       DateTime?
  delivered    Boolean          @default(false)
  deliveredAt  DateTime?
  scheduledFor DateTime?
  createdAt    DateTime         @default(now())
  updatedAt    DateTime         @updatedAt
  user         User             @relation(fields: [userId], references: [id])
}
```

## Performance Considerations

1. **WebSocket Connections**: Automatically cleaned up after 30 minutes of inactivity
2. **Database Cleanup**: Old read notifications (90+ days) are automatically deleted
3. **Batch Operations**: Use bulk endpoints for multiple notifications
4. **Indexing**: Database indexes on userId, type, read, and scheduledFor fields
5. **Connection Stats**: Real-time monitoring of active connections

## Monitoring & Health Checks

### Connection Statistics
```javascript
const stats = notificationService.getConnectionStats();
// Returns:
// {
//   totalConnections: number,
//   activeConnections: number,
//   adminConnections: number,
//   maidConnections: number,
//   customerConnections: number
// }
```

### Health Check
```javascript
const health = await notificationService.healthCheck();
// Returns:
// {
//   status: 'healthy',
//   connections: {...},
//   recentNotifications: number,
//   timestamp: ISO string
// }
```

## Error Handling

All notification methods include error handling and logging:
- Failed WebSocket sends are logged but don't throw errors
- Database errors are caught and logged
- Notifications are always saved to database even if WebSocket delivery fails

## Best Practices

1. **Always save to database**: Even for real-time notifications
2. **Use appropriate notification types**: Follow the defined types
3. **Include relevant data**: Provide context in the data field
4. **Test with different roles**: Ensure role-specific messages are correct
5. **Monitor performance**: Use health checks and stats endpoints
6. **Clean up regularly**: Let the scheduler handle old notifications
7. **Use templates**: Leverage the template system for consistency
8. **Support multiple languages**: Use user's preferred language

## Integration with Existing Code

### In Booking Controller
```javascript
// After creating booking
await notificationService.notifyBookingCreated(booking);

// After assigning maid
await notificationService.notifyMaidAssigned(booking);

// After service completion
await notificationService.notifyServiceCompleted(booking);
```

### In Assignment Request Handler
```javascript
// When sending request
await notificationEnhancements.notifyAssignmentRequestSent(
  request, booking, maid
);

// When accepted
await notificationEnhancements.notifyAssignmentAccepted(
  request, booking, maid
);

// When rejected
await notificationEnhancements.notifyAssignmentRejected(
  request, booking, maid
);
```

### In Payment Handler
```javascript
// Payment success
await notificationService.notifyPaymentReceived(payment);

// Payment failed
await notificationService.notifyPaymentFailed(payment);
```

## Troubleshooting

### WebSocket Connection Issues
1. Check if WebSocket server is running
2. Verify JWT token is valid
3. Check firewall/proxy settings
4. Monitor connection stats

### Notifications Not Received
1. Check if user is connected via WebSocket
2. Verify notification is saved in database
3. Check user's notification preferences
4. Review server logs for errors

### Performance Issues
1. Monitor active connection count
2. Check database query performance
3. Review scheduled job execution times
4. Consider scaling WebSocket server

## Future Enhancements

1. **Push Notifications**: Mobile push notification support
2. **Email Notifications**: Email delivery for critical notifications
3. **SMS Notifications**: SMS alerts for urgent notifications
4. **Notification Preferences**: User-configurable notification settings
5. **Notification Groups**: Group related notifications
6. **Rich Notifications**: Support for images and actions
7. **Notification Analytics**: Track delivery and engagement metrics
8. **A/B Testing**: Test different notification messages

## Support

For issues or questions:
- Check server logs in `logs/` directory
- Review notification statistics via admin endpoints
- Monitor WebSocket connection health
- Contact development team

---

**Version**: 1.0.0  
**Last Updated**: 2025-01-20  
**Maintained By**: Sweep-Pro Development Team
