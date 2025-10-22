# Sweepro API Testing Guide - BullMQ Queue Management

This document provides comprehensive API endpoints for testing the BullMQ-based assignment scheduling system in Postman.

## 📋 Table of Contents

1. [Setup](#setup)
2. [Authentication](#authentication)
3. [Queue Management APIs](#queue-management-apis)
4. [Assignment Workflow APIs](#assignment-workflow-apis)
5. [Testing Scenarios](#testing-scenarios)

---

## 🔧 Setup

### Base URL

**Local Development:**
```
http://localhost:3000
```

**Production (Render):**
```
https://your-app.onrender.com
```

### Environment Variables in Postman

Create a Postman environment with:

| Variable | Value | Description |
|----------|-------|-------------|
| `base_url` | `http://localhost:3000` | API base URL |
| `admin_token` | *set after login* | Admin JWT token |
| `customer_token` | *set after login* | Customer JWT token |
| `maid_token` | *set after login* | Maid JWT token |

---

## 🔐 Authentication

### 1. Admin Login

**Request:**
```http
POST {{base_url}}/api/auth/login
Content-Type: application/json

{
  "email": "admin@sweepro.com",
  "password": "admin123"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": "admin-user-id",
      "email": "admin@sweepro.com",
      "role": "ADMIN",
      "name": "Admin User"
    }
  }
}
```

**Postman Test Script:**
```javascript
if (pm.response.code === 200) {
    const jsonData = pm.response.json();
    pm.environment.set("admin_token", jsonData.data.token);
    console.log("✅ Admin token saved");
}
```

### 2. Maid Login

**Request:**
```http
POST {{base_url}}/api/auth/login
Content-Type: application/json

{
  "email": "maid@sweepro.com",
  "password": "maid123"
}
```

**Postman Test Script:**
```javascript
if (pm.response.code === 200) {
    const jsonData = pm.response.json();
    pm.environment.set("maid_token", jsonData.data.token);
}
```

### 3. Customer Login

**Request:**
```http
POST {{base_url}}/api/auth/login
Content-Type: application/json

{
  "email": "customer@sweepro.com",
  "password": "customer123"
}
```

**Postman Test Script:**
```javascript
if (pm.response.code === 200) {
    const jsonData = pm.response.json();
    pm.environment.set("customer_token", jsonData.data.token);
}
```

---

## 🎛️ Queue Management APIs

### 1. Queue Health Check (Public)

**Request:**
```http
GET {{base_url}}/api/queue/health
```

**Response:**
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
      "delayed": 5,
      "total": 31
    },
    "timestamp": "2025-10-22T10:30:00.000Z"
  }
}
```

**Postman Test Script:**
```javascript
pm.test("Redis is healthy", function () {
    const jsonData = pm.response.json();
    pm.expect(jsonData.data.redis).to.eql("healthy");
});

pm.test("Queue is healthy", function () {
    const jsonData = pm.response.json();
    pm.expect(jsonData.data.queue).to.eql("healthy");
});
```

### 2. Get Queue Statistics

**Request:**
```http
GET {{base_url}}/api/queue/stats
Authorization: Bearer {{admin_token}}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "waiting": 0,
    "active": 2,
    "completed": 150,
    "failed": 3,
    "delayed": 8,
    "total": 163
  },
  "timestamp": "2025-10-22T10:30:00.000Z"
}
```

### 3. Get All Jobs in Queue

**Request:**
```http
GET {{base_url}}/api/queue/jobs
Authorization: Bearer {{admin_token}}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "waiting": [],
    "active": [
      {
        "id": "recurring-assignment-check",
        "name": "process-all-assignments",
        "data": {
          "isRecurring": true
        },
        "timestamp": 1698058800000
      }
    ],
    "completed": [
      {
        "id": "assignment-cust-123-12.00-1698145200000",
        "name": "create-assignment-request",
        "data": {
          "customerId": "cust-123",
          "maidId": "maid-456",
          "timeSlot": "12.00",
          "customerName": "John Doe",
          "maidName": "Jane Smith"
        },
        "finishedOn": 1698058900000
      }
    ],
    "failed": [],
    "delayed": [
      {
        "id": "assignment-cust-789-14.00-1698232000000",
        "name": "create-assignment-request",
        "data": {
          "customerId": "cust-789",
          "maidId": "maid-456",
          "timeSlot": "14.00"
        },
        "delay": 72000000
      }
    ]
  },
  "counts": {
    "waiting": 0,
    "active": 1,
    "completed": 1,
    "failed": 0,
    "delayed": 1
  }
}
```

### 4. Schedule All Assignments

**Request:**
```http
POST {{base_url}}/api/queue/schedule-all
Authorization: Bearer {{admin_token}}
```

**Response:**
```json
{
  "success": true,
  "message": "All active assignments scheduled successfully",
  "data": {
    "scheduled": 15,
    "errors": 2,
    "scheduledJobs": [
      {
        "customerId": "cust-123",
        "jobId": "assignment-cust-123-12.00-1698232000000",
        "scheduledTime": "2025-10-23T16:00:00.000Z",
        "serviceTime": "2025-10-24T12:00:00.000Z",
        "delay": 72000000
      }
    ],
    "errorDetails": []
  }
}
```

### 5. Process All Assignments Immediately

**Request:**
```http
POST {{base_url}}/api/queue/process-now
Authorization: Bearer {{admin_token}}
```

**Response:**
```json
{
  "success": true,
  "message": "Processing job queued successfully",
  "data": {
    "jobId": "process-all-1698058900000",
    "message": "Manual processing job queued"
  }
}
```

### 6. Schedule Specific Customer Assignment

**Request:**
```http
POST {{base_url}}/api/queue/schedule-customer
Authorization: Bearer {{admin_token}}
Content-Type: application/json

{
  "customerId": "customer-user-id",
  "maidId": "maid-profile-id",
  "timeSlot": "12.00"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Customer assignment scheduled successfully",
  "data": {
    "customerId": "customer-user-id",
    "jobId": "assignment-customer-user-id-12.00-1698232000000",
    "scheduledTime": "2025-10-23T16:00:00.000Z",
    "serviceTime": "2025-10-24T12:00:00.000Z",
    "delay": 72000000
  }
}
```

### 7. Clean Old Jobs

**Request:**
```http
POST {{base_url}}/api/queue/clean
Authorization: Bearer {{admin_token}}
Content-Type: application/json

{
  "graceMs": 86400000
}
```

**Response:**
```json
{
  "success": true,
  "message": "Queue cleaned successfully",
  "timestamp": "2025-10-22T10:30:00.000Z"
}
```

### 8. Retry Failed Job

**Request:**
```http
POST {{base_url}}/api/queue/retry/:jobId
Authorization: Bearer {{admin_token}}
```

**Example:**
```http
POST {{base_url}}/api/queue/retry/assignment-cust-123-12.00-1698232000000
Authorization: Bearer {{admin_token}}
```

**Response:**
```json
{
  "success": true,
  "message": "Job assignment-cust-123-12.00-1698232000000 queued for retry",
  "timestamp": "2025-10-22T10:30:00.000Z"
}
```

### 9. Pause Queue

**Request:**
```http
POST {{base_url}}/api/queue/pause
Authorization: Bearer {{admin_token}}
```

**Response:**
```json
{
  "success": true,
  "message": "Queue paused successfully",
  "timestamp": "2025-10-22T10:30:00.000Z"
}
```

### 10. Resume Queue

**Request:**
```http
POST {{base_url}}/api/queue/resume
Authorization: Bearer {{admin_token}}
```

**Response:**
```json
{
  "success": true,
  "message": "Queue resumed successfully",
  "timestamp": "2025-10-22T10:30:00.000Z"
}
```

---

## 🔄 Assignment Workflow APIs

### 1. Get Maid's Pending Assignment Requests

**Request:**
```http
GET {{base_url}}/api/assignments/pending
Authorization: Bearer {{maid_token}}
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "assignment-request-id",
      "bookingId": "booking-id",
      "maidId": "maid-profile-id",
      "customerId": "customer-user-id",
      "status": "pending",
      "requestedAt": "2025-10-22T10:00:00.000Z",
      "expiresAt": "2025-10-24T10:00:00.000Z",
      "booking": {
        "id": "booking-id",
        "scheduledAt": "2025-10-24T12:00:00.000Z",
        "timeSlot": "12.00",
        "serviceAddress": "123 Main St",
        "totalAmount": 500,
        "customer": {
          "id": "customer-id",
          "name": "John Doe",
          "email": "john@example.com",
          "phone": "+1234567890"
        },
        "service": {
          "id": "service-id",
          "name": "Home Cleaning",
          "category": "CLEANING"
        }
      }
    }
  ]
}
```

### 2. Accept Assignment Request (Maid)

**Request:**
```http
POST {{base_url}}/api/assignments/:assignmentId/accept
Authorization: Bearer {{maid_token}}
```

**Example:**
```http
POST {{base_url}}/api/assignments/assignment-request-id/accept
Authorization: Bearer {{maid_token}}
```

**Response:**
```json
{
  "success": true,
  "message": "Assignment accepted successfully",
  "data": {
    "id": "assignment-request-id",
    "status": "accepted",
    "respondedAt": "2025-10-22T10:30:00.000Z",
    "booking": {
      "id": "booking-id",
      "status": "CONFIRMED",
      "assignmentStatus": "ACCEPTED"
    }
  }
}
```

### 3. Reject Assignment Request (Maid)

**Request:**
```http
POST {{base_url}}/api/assignments/:assignmentId/reject
Authorization: Bearer {{maid_token}}
Content-Type: application/json

{
  "rejectionReason": "Not available at this time"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Assignment rejected successfully",
  "data": {
    "id": "assignment-request-id",
    "status": "rejected",
    "rejectionReason": "Not available at this time",
    "respondedAt": "2025-10-22T10:30:00.000Z"
  }
}
```

### 4. Get Customer Bookings

**Request:**
```http
GET {{base_url}}/api/bookings
Authorization: Bearer {{customer_token}}
```

### 5. Admin: Assign Maid to Customer

**Request:**
```http
POST {{base_url}}/api/admin/customer-assignments
Authorization: Bearer {{admin_token}}
Content-Type: application/json

{
  "customerId": "customer-user-id",
  "maidId": "maid-profile-id",
  "notes": "Preferred maid for this customer"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Assignment request sent to maid successfully",
  "data": {
    "id": "customer-assignment-request-id",
    "customerId": "customer-user-id",
    "maidId": "maid-profile-id",
    "status": "pending",
    "notes": "Preferred maid for this customer",
    "requestedAt": "2025-10-22T10:00:00.000Z",
    "expiresAt": "2025-10-23T10:00:00.000Z"
  }
}
```

---

## 🧪 Testing Scenarios

### Scenario 1: Complete Assignment Workflow

**Step 1: Admin assigns maid to customer**
```http
POST {{base_url}}/api/admin/customer-assignments
Authorization: Bearer {{admin_token}}

{
  "customerId": "{{customer_id}}",
  "maidId": "{{maid_profile_id}}",
  "notes": "Regular weekly assignment"
}
```

**Step 2: Maid accepts the assignment**
```http
POST {{base_url}}/api/assignments/{{assignment_request_id}}/accept
Authorization: Bearer {{maid_token}}
```

**Step 3: Background jobs are scheduled automatically**
```http
GET {{base_url}}/api/queue/stats
Authorization: Bearer {{admin_token}}
```

**Step 4: Verify jobs in queue**
```http
GET {{base_url}}/api/queue/jobs
Authorization: Bearer {{admin_token}}
```

### Scenario 2: Manual Job Triggering

**Step 1: Check queue health**
```http
GET {{base_url}}/api/queue/health
```

**Step 2: Manually trigger processing**
```http
POST {{base_url}}/api/queue/process-now
Authorization: Bearer {{admin_token}}
```

**Step 3: Verify job execution**
```http
GET {{base_url}}/api/queue/jobs
Authorization: Bearer {{admin_token}}
```

### Scenario 3: Failed Job Recovery

**Step 1: Check for failed jobs**
```http
GET {{base_url}}/api/queue/jobs
Authorization: Bearer {{admin_token}}
```

**Step 2: Retry a failed job**
```http
POST {{base_url}}/api/queue/retry/{{failed_job_id}}
Authorization: Bearer {{admin_token}}
```

**Step 3: Verify retry**
```http
GET {{base_url}}/api/queue/stats
Authorization: Bearer {{admin_token}}
```

### Scenario 4: Testing 20-Hour Schedule

**Step 1: Create customer with time slot**
```http
POST {{base_url}}/api/admin/customer-assignments
Authorization: Bearer {{admin_token}}

{
  "customerId": "customer-id",
  "maidId": "maid-id",
  "notes": "Test 20-hour scheduling"
}
```

**Step 2: Maid accepts**
```http
POST {{base_url}}/api/assignments/{{assignment_id}}/accept
Authorization: Bearer {{maid_token}}
```

**Step 3: Check scheduled jobs**
```http
GET {{base_url}}/api/queue/jobs
Authorization: Bearer {{admin_token}}
```

Look for delayed jobs that match 20 hours before customer's time slot.

---

## 📊 Postman Collection Structure

```
Sweepro API - BullMQ
├── Auth
│   ├── Admin Login
│   ├── Customer Login
│   └── Maid Login
├── Queue Management (Admin)
│   ├── Health Check
│   ├── Get Queue Stats
│   ├── Get All Jobs
│   ├── Schedule All Assignments
│   ├── Process Now
│   ├── Schedule Customer
│   ├── Clean Queue
│   ├── Retry Failed Job
│   ├── Pause Queue
│   └── Resume Queue
├── Assignments (Maid)
│   ├── Get Pending Assignments
│   ├── Accept Assignment
│   ├── Reject Assignment
│   └── Get My Assignments
├── Customer Assignments (Admin)
│   └── Assign Maid to Customer
└── Bookings
    ├── Get Customer Bookings
    └── Get Booking Details
```

---

## ✅ Test Checklist

### Local Development
- [ ] Redis is running locally
- [ ] Main app is running (`npm run dev`)
- [ ] Worker is running (`npm run worker:dev`)
- [ ] Queue health check passes
- [ ] Can login as admin
- [ ] Can schedule jobs
- [ ] Jobs are processed by worker

### Production (Render)
- [ ] Main web service deployed
- [ ] Background worker deployed
- [ ] Redis instance running
- [ ] Queue health check passes (https://your-app.onrender.com/api/queue/health)
- [ ] Can login as admin
- [ ] Jobs are being scheduled
- [ ] Worker logs show job processing

---

## 🔍 Monitoring Tips

### Check Worker is Running

```http
GET {{base_url}}/api/queue/stats
```

If `active` count is 0 and there are jobs in `delayed`, the worker might be down.

### Verify Scheduled Jobs

```http
GET {{base_url}}/api/queue/jobs
```

Check `delayed` array for jobs scheduled for future execution.

### Monitor Queue Health

```http
GET {{base_url}}/api/queue/health
```

Should return `redis: "healthy"` and `queue: "healthy"`.

---

## 📝 Notes

1. **Authorization**: All admin and protected routes require `Authorization: Bearer {token}` header
2. **Job IDs**: Job IDs follow pattern: `assignment-{customerId}-{timeSlot}-{timestamp}`
3. **Time Slots**: Format: "12.00", "14.00", etc.
4. **Delays**: Jobs are scheduled with calculated delays (milliseconds)
5. **Retry Logic**: Failed jobs retry 3 times with exponential backoff

---

**Happy Testing! 🚀**
