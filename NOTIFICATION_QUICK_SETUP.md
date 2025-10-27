# Notification System - Quick Setup Guide

## 🚀 5-Minute Setup

### Step 1: Seed Test Data (2 minutes)

Run the main seed script to create all test data including notifications:

```bash
npx prisma db seed
```

**What this creates:**
- ✅ Multiple test users (Customers, Maids, Admin)
- ✅ User profiles and subscriptions
- ✅ Services and bookings
- ✅ 12 sample notifications (Customer, Maid, Admin)

**Test Credentials:**
```
Admin:    admin@sweepro.com / admin123
Customer: customer@sweepro.com / customer123
Maid:     maid@sweepro.com / maid123
```

---

### Step 2: Start Backend Server (30 seconds)

```bash
npm start
```

**Verify server is running:**
- Server should start on: `http://localhost:3000`
- WebSocket server initialized
- Check console for: `🚀 Server running on port 3000`

---

### Step 3: Import Postman Collection (1 minute)

1. Open Postman
2. Click **Import**
3. Select file: `postman/Sweep-Pro-Notifications.postman_collection.json`
4. Collection imported ✅

**Collection includes:**
- Get All Notifications
- Get Unread Count
- Mark All as Read
- Admin Statistics
- Send Test Notification
- Broadcast Message

---

### Step 4: Login & Get Token (1 minute)

**Option A: Using Postman (if you have auth endpoints)**
```http
POST http://localhost:3000/api/auth/login
Content-Type: application/json

{
  "email": "customer@sweepro.com",
  "password": "customer123"
}
```

**Option B: Manual Token Setup**

If you already have JWT tokens, set them in Postman variables:
- `auth_token`: Your JWT token
- `admin_token`: Admin JWT token
- `user_id`: User ID from seed output

---

### Step 5: Test Notifications (1 minute)

**Quick Test Sequence:**

1. **Get All Notifications**
   ```http
   GET http://localhost:3000/api/notifications
   Authorization: Bearer {{auth_token}}
   ```
   Expected: List of 3-4 notifications

2. **Get Unread Count**
   ```http
   GET http://localhost:3000/api/notifications/unread/count
   ```
   Expected: `{ "unreadCount": 3 }`

3. **Send Test Notification (Admin)**
   ```http
   POST http://localhost:3000/api/notifications/admin/test
   Authorization: Bearer {{admin_token}}
   Content-Type: application/json

   {
     "userId": "{{user_id}}",
     "type": "BOOKING_CREATED",
     "title": "Test Notification",
     "message": "This is a test",
     "data": {}
   }
   ```
   Expected: Notification sent successfully

---

## ✅ Verification Checklist

After setup, verify:
- [ ] Backend server running on port 3000
- [ ] Test users created (check seed output)
- [ ] Postman collection imported
- [ ] Can get notifications via API
- [ ] Unread count shows correct number
- [ ] Admin can send test notifications

---

## 🔍 Quick Troubleshooting

### Server won't start?
```bash
# Check if port 3000 is in use
netstat -ano | findstr :3000

# Kill process if needed
taskkill /PID <PID> /F

# Restart server
npm start
```

### Seed script fails?
```bash
# Make sure database is running
# Check Prisma connection in .env file
# Run migrations first
npx prisma migrate dev
```

### Postman requests fail?
- Check base_url is `http://localhost:3000`
- Verify auth_token is set
- Check if server is running
- Look at server console for errors

---

## 📊 Seed Data Summary

### Users Created:
| Role | Email | Password | Purpose |
|------|-------|----------|---------|
| Admin | admin@sweepro.com | admin123 | Test admin features |
| Customer | customer@sweepro.com | customer123 | Test customer notifications |
| Maid | maid@sweepro.com | maid123 | Test maid notifications |

### Notifications Created:

**Customer (5 notifications):**
- ✉️ Booking Confirmed (unread)
- ✉️ Maid Assigned (unread)
- ✉️ Service Reminder (unread)
- ✅ Payment Received (read)
- ✅ Subscription Activated (read)

**Maid (3 notifications):**
- ✉️ Service Assigned (unread)
- ✉️ Shift Reminder (unread)
- ✅ Positive Feedback (read)

**Admin (4 notifications):**
- ✉️ New Booking Created (unread)
- ✉️ Payment Confirmation (unread)
- ✅ New Subscription (read)
- ✅ System Health Check (read)

---

## 🎯 Quick Test Scenarios

### Scenario 1: Basic Flow (2 minutes)
```bash
1. GET /api/notifications → See all notifications
2. GET /api/notifications/unread/count → Check unread count
3. PATCH /api/notifications/read-all → Mark all as read
4. GET /api/notifications/unread/count → Verify count is 0
```

### Scenario 2: Admin Broadcast (1 minute)
```bash
1. Login as admin
2. POST /api/notifications/admin/broadcast
   {
     "type": "SYSTEM_ALERT",
     "title": "Test Broadcast",
     "message": "Testing broadcast feature",
     "targetRole": "CUSTOMER"
   }
3. Login as customer
4. GET /api/notifications → See broadcast message
```

### Scenario 3: WebSocket Test (2 minutes)
```javascript
// Open browser console
const ws = new WebSocket('ws://localhost:3000');

ws.onopen = () => {
  console.log('Connected');
  ws.send(JSON.stringify({
    type: 'auth',
    token: 'YOUR_JWT_TOKEN'
  }));
};

ws.onmessage = (event) => {
  console.log('Notification:', JSON.parse(event.data));
};

// Send test notification via Postman
// Should appear in console instantly
```

---

## 📈 Expected Results

### GET /api/notifications
```json
{
  "success": true,
  "data": [
    {
      "id": "...",
      "type": "BOOKING_CREATED",
      "title": "Booking Confirmed",
      "message": "Your booking has been created",
      "read": false,
      "createdAt": "2025-01-20T..."
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 4
  },
  "unreadCount": 3
}
```

### GET /api/notifications/unread/count
```json
{
  "success": true,
  "unreadCount": 3
}
```

### POST /api/notifications/admin/test
```json
{
  "success": true,
  "message": "Test notification sent successfully",
  "notification": {
    "id": "...",
    "userId": "...",
    "type": "BOOKING_CREATED",
    "title": "Test Notification"
  }
}
```

---

## 🎓 Next Steps

After quick setup:
1. ✅ Read full testing guide: `NOTIFICATION_TESTING_ROADMAP.md`
2. ✅ Review system documentation: `NOTIFICATION_SYSTEM_IMPLEMENTATION.md`
3. ✅ Test all notification types
4. ✅ Test scheduled jobs
5. ✅ Integrate with your existing code

---

## 📞 Need Help?

**Common Issues:**
- Port already in use → Change PORT in .env or kill process
- Database connection error → Check DATABASE_URL in .env
- Seed fails → Run `npx prisma migrate dev` first
- Auth token invalid → Re-login to get fresh token

**Documentation:**
- Full Implementation: `NOTIFICATION_SYSTEM_IMPLEMENTATION.md`
- Testing Guide: `NOTIFICATION_TESTING_ROADMAP.md`
- API Reference: See implementation doc

---

## 🎉 You're Ready!

Your notification system is now set up and ready for testing. Start with the Postman collection and explore all features!

**Quick Commands:**
```bash
# Seed data
npx prisma db seed

# Start server
npm start

# Check health
curl http://localhost:3000/health
```

---

**Setup Time:** ~5 minutes  
**Last Updated:** January 2025  
**Backend Port:** 3000  
**WebSocket:** ws://localhost:3000
