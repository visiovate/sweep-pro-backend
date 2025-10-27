# Notification System Testing Roadmap

## 🎯 Overview

This comprehensive testing roadmap will guide you through testing all aspects of the notification system using Postman and other tools.

## 📋 Prerequisites

### 1. Environment Setup
- ✅ Backend server running on `http://localhost:3000`
- ✅ Database connected and seeded with test data
- ✅ Notification scheduler initialized
- ✅ WebSocket server running

### 2. Test Users Required
Create these test users in your database:

```sql
-- Customer User
INSERT INTO users (email, password, role) VALUES 
('customer@test.com', 'hashed_password', 'CUSTOMER');

-- Maid User
INSERT INTO users (email, password, role) VALUES 
('maid@test.com', 'hashed_password', 'MAID');

-- Admin User
INSERT INTO users (email, password, role) VALUES 
('admin@test.com', 'hashed_password', 'ADMIN');
```

### 3. Postman Setup
1. Import the collection: `postman/Sweep-Pro-Notifications.postman_collection.json`
2. Set environment variables:
   - `base_url`: `http://localhost:3000`
   - `auth_token`: (will be set automatically after login)
   - `admin_token`: (will be set automatically after admin login)
   - `user_id`: (will be set automatically after login)

## 🚀 Testing Phases

### Phase 1: Authentication & Setup (5 minutes)

#### Step 1.1: Login as Different Users
```bash
# Test each login endpoint in Postman
1. POST /api/auth/login (Customer)
2. POST /api/auth/login (Maid)
3. POST /api/auth/login (Admin)
```

**Expected Results:**
- ✅ Receive JWT tokens for each user
- ✅ Tokens automatically saved to collection variables
- ✅ User IDs captured

**Verification:**
```javascript
// Check Postman Console
console.log('Customer Token:', pm.collectionVariables.get('customer_token'));
console.log('Admin Token:', pm.collectionVariables.get('admin_token'));
```

---

### Phase 2: Basic Notification Operations (10 minutes)

#### Step 2.1: Get Notifications
```http
GET /api/notifications
Authorization: Bearer {{auth_token}}
```

**Test Cases:**
1. Get all notifications (default pagination)
2. Filter by read status: `?read=false`
3. Filter by type: `?type=BOOKING_CREATED`
4. Custom pagination: `?page=2&limit=10`
5. Date range filter: `?startDate=2025-01-01&endDate=2025-01-31`

**Expected Results:**
- ✅ Returns paginated notification list
- ✅ Includes unread count
- ✅ Proper filtering applied
- ✅ Response time < 500ms

#### Step 2.2: Get Unread Count
```http
GET /api/notifications/unread/count
```

**Expected Results:**
- ✅ Returns `{ success: true, unreadCount: number }`
- ✅ Count matches unread notifications

#### Step 2.3: Mark Notifications as Read
```http
# Single notification
PATCH /api/notifications/:id/read

# Multiple notifications
PATCH /api/notifications/read-multiple
Body: { "notificationIds": ["id1", "id2"] }

# All notifications
PATCH /api/notifications/read-all
```

**Expected Results:**
- ✅ Notifications marked as read
- ✅ `readAt` timestamp updated
- ✅ Unread count decreases

#### Step 2.4: Delete Notifications
```http
# Delete single
DELETE /api/notifications/:id

# Bulk delete
DELETE /api/notifications/bulk/delete
Body: { "notificationIds": ["id1", "id2"] }

# Clear all read
DELETE /api/notifications/bulk/clear-read
```

**Expected Results:**
- ✅ Notifications deleted from database
- ✅ Cannot retrieve deleted notifications
- ✅ Proper count returned

---

### Phase 3: Admin Operations (15 minutes)

#### Step 3.1: Get Statistics
```http
GET /api/notifications/admin/stats?timeframe=7d
Authorization: Bearer {{admin_token}}
```

**Test Different Timeframes:**
- `timeframe=24h` - Last 24 hours
- `timeframe=7d` - Last 7 days
- `timeframe=30d` - Last 30 days

**Test Role Filtering:**
- `userRole=CUSTOMER`
- `userRole=MAID`
- `userRole=ADMIN`

**Expected Results:**
```json
{
  "success": true,
  "data": {
    "totalNotifications": 150,
    "sentNotifications": 45,
    "readNotifications": 30,
    "unreadNotifications": 15,
    "deliveredNotifications": 40,
    "readRate": "66.67",
    "deliveryRate": "88.89",
    "notificationsByType": [...],
    "topUsers": [...],
    "connections": {...}
  }
}
```

#### Step 3.2: Health Check
```http
GET /api/notifications/admin/health
```

**Expected Results:**
```json
{
  "success": true,
  "data": {
    "status": "healthy",
    "connections": {
      "totalConnections": 5,
      "activeConnections": 3,
      "adminConnections": 1,
      "maidConnections": 1,
      "customerConnections": 1
    },
    "recentNotifications": 25,
    "timestamp": "2025-01-20T..."
  }
}
```

#### Step 3.3: Send Test Notifications
```http
POST /api/notifications/admin/test
Body: {
  "userId": "user-id",
  "type": "BOOKING_CREATED",
  "title": "Test Notification",
  "message": "This is a test",
  "data": {}
}
```

**Test All Notification Types:**
1. BOOKING_CREATED
2. MAID_ASSIGNED
3. ASSIGNMENT_REQUEST
4. SERVICE_STARTED
5. SERVICE_COMPLETED
6. PAYMENT_RECEIVED
7. PAYMENT_FAILED
8. SUBSCRIPTION_CREATED
9. FEEDBACK_REQUEST

**Expected Results:**
- ✅ Notification sent successfully
- ✅ Appears in user's notification list
- ✅ Real-time delivery via WebSocket (if connected)
- ✅ Saved to database

#### Step 3.4: Broadcast Notifications
```http
POST /api/notifications/admin/broadcast
Body: {
  "type": "SYSTEM_ALERT",
  "title": "System Announcement",
  "message": "Scheduled maintenance tonight",
  "targetRole": "CUSTOMER"
}
```

**Test Scenarios:**
1. Broadcast to all users (no targetRole)
2. Broadcast to customers only
3. Broadcast to maids only
4. Broadcast to admins only

**Expected Results:**
- ✅ All target users receive notification
- ✅ Non-target users don't receive it
- ✅ Notifications saved to database

#### Step 3.5: Maintenance & Emergency Alerts
```http
# Maintenance
POST /api/notifications/admin/maintenance
Body: {
  "startTime": "2025-01-25T02:00:00Z",
  "endTime": "2025-01-25T04:00:00Z",
  "description": "System upgrade"
}

# Emergency
POST /api/notifications/admin/emergency
Body: {
  "alertType": "SECURITY",
  "message": "Security alert",
  "priority": "CRITICAL"
}
```

**Expected Results:**
- ✅ All users notified
- ✅ High priority flags set
- ✅ Immediate delivery

---

### Phase 4: Workflow Testing (20 minutes)

#### Workflow 4.1: Complete Booking Lifecycle

**Step 1: Booking Created**
```http
POST /api/notifications/admin/test
Body: {
  "userId": "customer-id",
  "type": "BOOKING_CREATED",
  "title": "Booking Confirmed",
  "message": "Your booking for House Cleaning has been created",
  "data": {
    "bookingId": "BK001",
    "serviceName": "House Cleaning",
    "scheduledAt": "2025-01-25T10:00:00Z",
    "amount": 500
  }
}
```

**Step 2: Assignment Request to Maid**
```http
POST /api/notifications/admin/test
Body: {
  "userId": "maid-id",
  "type": "ASSIGNMENT_REQUEST",
  "title": "New Service Assignment Request",
  "message": "You have a new service request",
  "data": {
    "bookingId": "BK001",
    "serviceName": "House Cleaning",
    "customerName": "John Doe",
    "scheduledAt": "2025-01-25T10:00:00Z",
    "hoursToRespond": 24
  }
}
```

**Step 3: Assignment Accepted**
```http
POST /api/notifications/admin/test
Body: {
  "userId": "customer-id",
  "type": "ASSIGNMENT_ACCEPTED",
  "title": "Maid Accepted Assignment",
  "message": "Priya has accepted your service request",
  "data": {
    "bookingId": "BK001",
    "maidName": "Priya",
    "maidPhone": "+91-9876543210"
  }
}
```

**Step 4: Service Started**
```http
POST /api/notifications/admin/test
Body: {
  "userId": "customer-id",
  "type": "SERVICE_STARTED",
  "title": "Service Started",
  "message": "Your House Cleaning service has started",
  "data": {
    "bookingId": "BK001",
    "maidName": "Priya",
    "startedAt": "2025-01-25T10:05:00Z"
  }
}
```

**Step 5: Service Completed**
```http
POST /api/notifications/admin/test
Body: {
  "userId": "customer-id",
  "type": "SERVICE_COMPLETED",
  "title": "Service Completed",
  "message": "Your House Cleaning service has been completed",
  "data": {
    "bookingId": "BK001",
    "completedAt": "2025-01-25T12:00:00Z",
    "duration": "2 hours"
  }
}
```

**Step 6: Payment Received**
```http
POST /api/notifications/admin/test
Body: {
  "userId": "customer-id",
  "type": "PAYMENT_RECEIVED",
  "title": "Payment Received",
  "message": "Payment of ₹500 received successfully",
  "data": {
    "amount": 500,
    "paymentMethod": "UPI"
  }
}
```

**Step 7: Feedback Request**
```http
POST /api/notifications/admin/test
Body: {
  "userId": "customer-id",
  "type": "FEEDBACK_REQUEST",
  "title": "How was your service?",
  "message": "Please rate your House Cleaning service",
  "data": {
    "bookingId": "BK001"
  }
}
```

**Verification Checklist:**
- [ ] Customer receives 6 notifications (created, accepted, started, completed, payment, feedback)
- [ ] Maid receives 1 notification (assignment request)
- [ ] All notifications appear in correct order
- [ ] All data fields populated correctly
- [ ] Notifications can be marked as read
- [ ] Unread count updates correctly

---

### Phase 5: WebSocket Testing (15 minutes)

#### Step 5.1: Setup WebSocket Client

**Using Browser Console:**
```javascript
// Open browser console and run:
const ws = new WebSocket('ws://localhost:3000');

ws.onopen = () => {
  console.log('Connected');
  // Authenticate
  ws.send(JSON.stringify({
    type: 'auth',
    token: 'YOUR_JWT_TOKEN_HERE'
  }));
};

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log('Received:', data);
};

ws.onerror = (error) => {
  console.error('WebSocket error:', error);
};

// Send heartbeat every 30 seconds
setInterval(() => {
  ws.send(JSON.stringify({ type: 'ping' }));
}, 30000);
```

#### Step 5.2: Test Real-Time Delivery

1. **Connect as Customer** (Browser Tab 1)
2. **Connect as Admin** (Browser Tab 2)
3. **Send test notification** via Postman to customer
4. **Verify** customer receives it in real-time

**Expected Results:**
- ✅ WebSocket connection established
- ✅ Authentication successful
- ✅ Notifications received in real-time
- ✅ Heartbeat working

#### Step 5.3: Test Connection Management

**Test Cases:**
1. Connect multiple clients with same user
2. Disconnect and reconnect
3. Send notification while disconnected (should be in DB)
4. Reconnect and fetch missed notifications

---

### Phase 6: Scheduled Jobs Testing (30 minutes)

#### Step 6.1: Verify Scheduler Initialization

**Check Server Logs:**
```bash
# Look for these messages in console
🔔 Initializing Notification Scheduler...
✅ 13 notification jobs scheduled successfully
```

#### Step 6.2: Test Individual Jobs

**Booking Reminders (Every hour):**
1. Create a booking scheduled for tomorrow
2. Wait for next hour
3. Check if reminder notification sent

**Approaching Alerts (Every 30 min):**
1. Create a booking scheduled 3 hours from now
2. Wait 30 minutes
3. Check if approaching alert sent

**Overdue Check (Every 15 min):**
1. Create a booking scheduled 1 hour ago
2. Don't start the service
3. Wait 15 minutes
4. Check if overdue alert sent to admin

**Manual Testing Commands:**
```javascript
// In your server code, you can manually trigger jobs:
const notificationScheduler = require('./scheduler/notificationScheduler');

// Trigger specific job
await notificationScheduler.sendBookingReminders();
await notificationScheduler.checkOverdueBookings();
await notificationScheduler.sendPaymentReminders();
```

---

### Phase 7: Performance Testing (20 minutes)

#### Test 7.1: Load Testing

**Bulk Notification Creation:**
```javascript
// Create 100 notifications
for (let i = 0; i < 100; i++) {
  await POST /api/notifications/admin/test
}
```

**Metrics to Monitor:**
- Response time < 500ms per request
- Database query time < 100ms
- Memory usage stable
- No connection leaks

#### Test 7.2: Concurrent Users

**Simulate Multiple Users:**
1. Open 10 browser tabs
2. Connect WebSocket in each
3. Send broadcast notification
4. Verify all receive it

**Expected Results:**
- ✅ All connections stable
- ✅ All users receive notification
- ✅ No dropped connections
- ✅ Server memory stable

#### Test 7.3: Database Performance

**Test Queries:**
```sql
-- Check notification count
SELECT COUNT(*) FROM notifications;

-- Check unread count per user
SELECT userId, COUNT(*) FROM notifications 
WHERE read = false 
GROUP BY userId;

-- Check old notifications
SELECT COUNT(*) FROM notifications 
WHERE createdAt < NOW() - INTERVAL '90 days';
```

---

### Phase 8: Error Handling (15 minutes)

#### Test 8.1: Invalid Requests

**Test Cases:**
```http
# Missing required fields
POST /api/notifications/admin/test
Body: { "userId": "123" }
Expected: 400 Bad Request

# Invalid notification type
POST /api/notifications/admin/test
Body: { "userId": "123", "type": "INVALID_TYPE" }
Expected: 400 Bad Request

# Unauthorized access
GET /api/notifications/admin/stats
Authorization: Bearer {{customer_token}}
Expected: 403 Forbidden

# Invalid notification ID
PATCH /api/notifications/invalid-id/read
Expected: 404 Not Found
```

#### Test 8.2: Network Failures

**Test Scenarios:**
1. Disconnect internet during notification send
2. Stop database during query
3. Close WebSocket connection abruptly

**Expected Results:**
- ✅ Graceful error handling
- ✅ Proper error messages
- ✅ No server crashes
- ✅ Automatic retry where applicable

---

## 📊 Testing Checklist

### Basic Operations
- [ ] Get all notifications
- [ ] Get unread notifications
- [ ] Get unread count
- [ ] Mark single as read
- [ ] Mark multiple as read
- [ ] Mark all as read
- [ ] Delete single notification
- [ ] Bulk delete notifications
- [ ] Clear read notifications
- [ ] Filter by type
- [ ] Filter by date range
- [ ] Pagination works

### Admin Operations
- [ ] Get statistics (24h, 7d, 30d)
- [ ] Get health status
- [ ] Send test notification
- [ ] Broadcast to all
- [ ] Broadcast to specific role
- [ ] Send maintenance alert
- [ ] Send emergency alert
- [ ] View connection stats

### Workflow Testing
- [ ] Complete booking lifecycle
- [ ] Assignment request flow
- [ ] Payment notifications
- [ ] Subscription notifications
- [ ] Feedback flow
- [ ] Task completion flow

### Real-Time Testing
- [ ] WebSocket connection
- [ ] Real-time delivery
- [ ] Multiple connections
- [ ] Heartbeat mechanism
- [ ] Reconnection handling

### Scheduled Jobs
- [ ] Booking reminders
- [ ] Approaching alerts
- [ ] Overdue checks
- [ ] Payment reminders
- [ ] Subscription alerts
- [ ] Feedback requests
- [ ] Attendance alerts
- [ ] Performance alerts
- [ ] Daily summaries
- [ ] Cleanup job

### Performance
- [ ] Response time < 500ms
- [ ] Handles 100+ notifications
- [ ] Multiple concurrent users
- [ ] Database queries optimized
- [ ] Memory usage stable
- [ ] No connection leaks

### Error Handling
- [ ] Invalid requests handled
- [ ] Unauthorized access blocked
- [ ] Network failures handled
- [ ] Database errors handled
- [ ] Proper error messages

---

## 🎯 Success Criteria

### Must Pass (Critical)
✅ All basic CRUD operations work
✅ Admin operations accessible only to admins
✅ Real-time delivery via WebSocket
✅ Notifications saved to database
✅ Scheduled jobs running
✅ No server crashes
✅ Proper error handling

### Should Pass (Important)
✅ Response time < 500ms
✅ Handles 50+ concurrent users
✅ All notification types work
✅ Multi-language support
✅ Bulk operations efficient
✅ Connection cleanup works

### Nice to Have (Optional)
✅ Response time < 200ms
✅ Handles 100+ concurrent users
✅ Advanced filtering
✅ Analytics and insights
✅ Notification preferences

---

## 🐛 Common Issues & Solutions

### Issue 1: Notifications Not Received
**Symptoms:** User doesn't receive notifications
**Check:**
- [ ] User authenticated?
- [ ] WebSocket connected?
- [ ] Notification saved to database?
- [ ] Correct userId used?

**Solution:**
```javascript
// Check database
SELECT * FROM notifications WHERE userId = 'user-id' ORDER BY createdAt DESC;

// Check WebSocket connections
GET /api/notifications/admin/health
```

### Issue 2: Scheduler Not Running
**Symptoms:** Scheduled notifications not sent
**Check:**
- [ ] Scheduler initialized in index.js?
- [ ] Cron syntax correct?
- [ ] Server timezone correct?

**Solution:**
```javascript
// Check logs for initialization message
// Manually trigger job to test
await notificationScheduler.sendBookingReminders();
```

### Issue 3: High Memory Usage
**Symptoms:** Server memory increasing
**Check:**
- [ ] WebSocket connections cleaned up?
- [ ] Old notifications deleted?
- [ ] No memory leaks?

**Solution:**
```javascript
// Check active connections
GET /api/notifications/admin/health

// Manually trigger cleanup
await notificationScheduler.cleanupOldNotifications();
```

---

## 📈 Monitoring During Testing

### Key Metrics to Track
1. **Response Times:** < 500ms
2. **Error Rate:** < 1%
3. **WebSocket Connections:** Stable
4. **Database Size:** Growing reasonably
5. **Memory Usage:** Stable
6. **CPU Usage:** < 70%

### Tools to Use
- Postman for API testing
- Browser DevTools for WebSocket
- Database client for queries
- Server logs for debugging
- Performance monitoring tools

---

## 🎓 Next Steps After Testing

1. **Document Issues:** Note any bugs found
2. **Performance Tuning:** Optimize slow queries
3. **User Feedback:** Gather feedback on notifications
4. **Monitoring Setup:** Set up production monitoring
5. **Scaling Plan:** Plan for increased load
6. **Backup Strategy:** Implement notification backup

---

## 📞 Support

If you encounter issues during testing:
1. Check server logs
2. Review this testing guide
3. Check `NOTIFICATION_SYSTEM_IMPLEMENTATION.md`
4. Contact development team

---

**Testing Roadmap Version:** 1.0  
**Last Updated:** January 2025  
**Estimated Testing Time:** 2-3 hours for complete testing
