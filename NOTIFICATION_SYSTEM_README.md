# 🔔 Sweep Pro - Real-Time Notification System

A comprehensive, production-ready WebSocket-based notification system for the Sweep Pro cleaning service platform.

## 🚀 Features

### Core Functionality
- **Real-time WebSocket notifications** with automatic reconnection
- **Role-based notification routing** (Admin, Maid, Customer, Supervisor)
- **Persistent notification storage** for offline users
- **Comprehensive event coverage** for all user interactions
- **Scheduled notification jobs** with cron scheduling
- **Connection management** with heartbeat and cleanup
- **Production-ready error handling** and logging

### Notification Types
- **User Management**: Registration, profile updates, status changes
- **Booking Lifecycle**: Creation, assignment, status updates, cancellation
- **Service Operations**: Started, completed, maid arrival, delays
- **Payment Processing**: Success, failure, refunds, reminders
- **Subscription Management**: Creation, expiry, renewal, cancellation
- **Issue Management**: Reporting, resolution, escalation
- **Performance Monitoring**: Alerts, attendance, document verification
- **System Operations**: Maintenance, emergency alerts, promotional offers

## 🏗️ Architecture

### Backend Components
```
src/
├── services/
│   └── notificationService.js    # Main notification service
├── routes/
│   └── notificationRoutes.js     # REST API endpoints
├── controllers/
│   ├── userController.js         # User notifications
│   ├── bookingController.js      # Booking notifications
│   ├── paymentController.js      # Payment notifications
│   └── ...                       # Other controllers
└── index.js                      # WebSocket server setup
```

### WebSocket Server
- **Technology**: Node.js with `ws` library
- **Authentication**: JWT token-based authentication
- **Connection Management**: User role-based routing
- **Heartbeat**: 30-second ping/pong for connection health
- **Auto-reconnection**: Client-side reconnection logic

### Database Integration
- **Storage**: PostgreSQL with Prisma ORM
- **Notification Table**: Persistent storage for offline users
- **Indexes**: Optimized for fast retrieval and filtering
- **Cleanup**: Automated cleanup of old notifications

## 📋 API Endpoints

### User Notification Management
```
GET    /api/notifications           # Get user notifications (paginated)
GET    /api/notifications/unread    # Get unread notifications
PATCH  /api/notifications/:id/read  # Mark notification as read
PATCH  /api/notifications/read-all  # Mark all notifications as read
DELETE /api/notifications/:id       # Delete notification
```

### Admin Operations
```
GET    /api/notifications/stats     # Notification statistics
POST   /api/notifications/test      # Send test notification
POST   /api/notifications/broadcast # Broadcast to all users
POST   /api/notifications/maintenance # System maintenance alert
POST   /api/notifications/emergency # Emergency alert
GET    /api/notifications/health    # WebSocket health check
GET    /api/notifications/types     # Available notification types
```

## 🔧 Installation & Setup

### 1. Install Dependencies
```bash
npm install ws uuid node-cron
```

### 2. Environment Variables
```env
JWT_SECRET=your-secret-key
DATABASE_URL=your-database-url
PORT=3000
```

### 3. Database Setup
The notification system uses the existing `Notification` table from your Prisma schema.

### 4. Start Server
```bash
npm run dev
```

## 🌐 Client Integration

### Basic JavaScript Client
```javascript
const client = new SweepProNotificationClient('ws://localhost:3000', 'your-jwt-token');

// Set up event listeners
client.on('authenticated', (user) => {
  console.log('Connected as:', user.name);
});

client.on('notification', (notification) => {
  console.log('New notification:', notification);
});

// Connect
client.connect();
```

### React Hook
```javascript
import { useEffect, useState } from 'react';

export const useNotifications = (authToken) => {
  const [client, setClient] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (authToken) {
      const notificationClient = new SweepProNotificationClient('ws://localhost:3000', authToken);
      
      notificationClient.on('notification', (notification) => {
        setNotifications(prev => [notification, ...prev]);
        setUnreadCount(prev => prev + 1);
      });

      notificationClient.connect();
      setClient(notificationClient);

      return () => notificationClient.disconnect();
    }
  }, [authToken]);

  return { client, notifications, unreadCount };
};
```

### Vue 3 Composition API
```javascript
import { ref, onMounted, onUnmounted } from 'vue';

export function useNotifications(authToken) {
  const client = ref(null);
  const notifications = ref([]);
  const unreadCount = ref(0);

  onMounted(() => {
    if (authToken.value) {
      const notificationClient = new SweepProNotificationClient('ws://localhost:3000', authToken.value);
      
      notificationClient.on('notification', (notification) => {
        notifications.value.unshift(notification);
        unreadCount.value++;
      });

      notificationClient.connect();
      client.value = notificationClient;
    }
  });

  onUnmounted(() => {
    if (client.value) {
      client.value.disconnect();
    }
  });

  return { client, notifications, unreadCount };
}
```

## 📊 Notification Types & Events

### User Events
- `USER_REGISTERED` - New user registration
- `PROFILE_UPDATED` - Profile information updated
- `USER_STATUS_CHANGED` - Account status change

### Booking Events
- `BOOKING_CREATED` - New booking created
- `BOOKING_CONFIRMED` - Booking confirmed
- `MAID_ASSIGNED` - Maid assigned to booking
- `MAID_ARRIVED` - Maid arrived at location
- `SERVICE_STARTED` - Service started
- `SERVICE_COMPLETED` - Service completed
- `BOOKING_CANCELLED` - Booking cancelled
- `BOOKING_RESCHEDULED` - Booking rescheduled
- `BOOKING_REMINDER` - Booking reminder

### Payment Events
- `PAYMENT_RECEIVED` - Payment successful
- `PAYMENT_FAILED` - Payment failed
- `PAYMENT_REMINDER` - Payment reminder
- `REFUND_PROCESSED` - Refund processed

### Subscription Events
- `SUBSCRIPTION_CREATED` - New subscription
- `SUBSCRIPTION_EXPIRING` - Subscription expiring
- `SUBSCRIPTION_RENEWED` - Subscription renewed
- `SUBSCRIPTION_CANCELLED` - Subscription cancelled

### System Events
- `SYSTEM_MAINTENANCE` - Maintenance window
- `EMERGENCY_ALERT` - Emergency alert
- `NEW_SERVICE_AVAILABLE` - New service launched
- `PROMOTIONAL_OFFER` - Special offers

### Maid-Specific Events
- `MAID_STATUS_CHANGED` - Maid status update
- `DOCUMENT_VERIFIED` - Document verification
- `PERFORMANCE_ALERT` - Performance alert
- `ATTENDANCE_ALERT` - Attendance alert
- `SHIFT_REMINDER` - Shift reminder

## ⚡ Performance Features

### Connection Management
- **Heartbeat**: 30-second ping/pong for connection health
- **Auto-reconnection**: Exponential backoff with max attempts
- **Connection pooling**: Efficient memory usage for multiple connections
- **Inactive cleanup**: Automatic cleanup of stale connections

### Notification Optimization
- **Batching**: Efficient message delivery
- **Persistence**: Offline message storage
- **Indexing**: Optimized database queries
- **Caching**: In-memory notification caching

### Monitoring & Analytics
- **Connection statistics**: Real-time connection metrics
- **Notification analytics**: Delivery and read rates
- **Performance monitoring**: Response times and error rates
- **Health checks**: System health monitoring

## 🔒 Security Features

### Authentication
- **JWT token validation** for all connections
- **Role-based access control** for notifications
- **Token refresh** support
- **Connection timeout** management

### Data Protection
- **Input validation** for all notification data
- **XSS prevention** in notification content
- **Rate limiting** for API endpoints
- **Secure WebSocket connections** (WSS in production)

## 📈 Scheduled Jobs

### Daily Jobs
- **6:00 PM**: Booking reminders for next day
- **9:00 AM**: Subscription expiry reminders
- **9:30 AM**: Attendance alerts

### Periodic Jobs
- **Every 6 hours**: Payment reminders
- **Every hour**: Connection cleanup
- **Weekly (Monday 10 AM)**: Performance alerts

### Job Configuration
```javascript
// Custom job example
cron.schedule('0 12 * * *', async () => {
  await notificationService.sendDailyReports();
});
```

## 🧪 Testing

### Unit Tests
```bash
npm test
```

### Integration Tests
```bash
npm run test:integration
```

### WebSocket Testing
```bash
# Test WebSocket connection
wscat -c ws://localhost:3000

# Send authentication
{"type": "auth", "token": "your-jwt-token"}

# Send ping
{"type": "ping"}
```

## 🚀 Production Deployment

### Environment Setup
```env
NODE_ENV=production
JWT_SECRET=your-production-secret
DATABASE_URL=your-production-database
PORT=3000
```

### Performance Optimization
- **Cluster mode**: Multi-process deployment
- **Load balancing**: WebSocket-aware load balancer
- **Connection limits**: Per-user connection limits
- **Memory optimization**: Efficient message handling

### Monitoring
- **Health checks**: Regular health monitoring
- **Metrics collection**: Connection and notification metrics
- **Error tracking**: Comprehensive error logging
- **Alerts**: System alert configuration

## 📝 Usage Examples

### Send Custom Notification
```javascript
await notificationService.sendToUser(userId, {
  type: 'CUSTOM_NOTIFICATION',
  title: 'Custom Alert',
  message: 'This is a custom notification',
  data: { customData: 'value' },
  timestamp: new Date().toISOString()
});
```

### Broadcast System Alert
```javascript
await notificationService.broadcast({
  type: 'SYSTEM_ALERT',
  title: 'System Update',
  message: 'System will be updated in 10 minutes',
  data: { priority: 'HIGH' },
  timestamp: new Date().toISOString()
});
```

### Admin Dashboard Integration
```javascript
// Get notification statistics
const stats = await fetch('/api/notifications/stats?timeframe=24h');
const { totalNotifications, readRate, connectionStats } = await stats.json();

// Send test notification
await fetch('/api/notifications/test', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    userId: 'user-id',
    title: 'Test Notification',
    message: 'This is a test notification'
  })
});
```

## 🔧 Troubleshooting

### Common Issues

**WebSocket Connection Failed**
```bash
# Check server status
curl http://localhost:3000/health

# Verify WebSocket endpoint
wscat -c ws://localhost:3000
```

**Authentication Issues**
```javascript
// Verify JWT token
const decoded = jwt.verify(token, process.env.JWT_SECRET);
console.log('Token payload:', decoded);
```

**Missing Notifications**
```javascript
// Check notification status
const unread = await notificationService.getUnreadNotifications(userId);
console.log('Unread notifications:', unread);
```

### Debug Mode
```javascript
// Enable debug logging
process.env.DEBUG = 'notification-service:*';
```

## 📚 Best Practices

### Client-Side
1. **Always handle connection failures** with retry logic
2. **Store notifications locally** for offline access
3. **Implement proper error handling** for all events
4. **Use heartbeat** to maintain connection health
5. **Request notification permissions** for browser notifications

### Server-Side
1. **Validate all notification data** before sending
2. **Use appropriate notification types** for different events
3. **Implement rate limiting** for notification endpoints
4. **Monitor connection health** and cleanup inactive connections
5. **Use database transactions** for notification persistence

## 🎯 Future Enhancements

### Planned Features
- **Push notifications** for mobile apps
- **Email notifications** for critical alerts
- **SMS notifications** for emergency alerts
- **Notification preferences** per user
- **Rich notifications** with images and actions
- **Notification templates** for consistent messaging
- **A/B testing** for notification effectiveness
- **Analytics dashboard** for notification insights

### Integration Possibilities
- **Firebase Cloud Messaging** for mobile push
- **SendGrid** for email notifications
- **Twilio** for SMS notifications
- **Slack** for team notifications
- **Microsoft Teams** for business notifications

---

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Implement your changes
4. Add comprehensive tests
5. Update documentation
6. Submit a pull request

## 📄 License

This project is licensed under the MIT License.

## 🆘 Support

For support and questions:
- Create an issue in the repository
- Contact the development team
- Check the troubleshooting guide

---

**Happy Coding! 🚀**
