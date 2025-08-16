# Postman Testing Guide for Booking Filtering API

This guide provides all the information you need to test the booking filtering functionality via Postman.

## 🚀 **Setup Instructions**

### 1. **Seed the Database**
First, run the seed script to populate your database with test data:

```bash
npm run seed
# or
npx prisma db seed
```

### 2. **Start the Server**
```bash
npm start
# or
npm run dev
```

## 🔐 **Authentication**

All endpoints require authentication. Use these test accounts:

### **Customer Accounts (for testing `/my-bookings` and `/stats`)**
- **Email:** `customer@sweepro.com` | **Password:** `customer123`
- **Email:** `customer2@sweepro.com` | **Password:** `customer2123`
- **Email:** `customer3@sweepro.com` | **Password:** `customer3123`
- **Email:** `customer4@sweepro.com` | **Password:** `customer4123`
- **Email:** `customer5@sweepro.com` | **Password:** `customer5123`

### **Maid Accounts (for testing `/my-assignments`)**
- **Email:** `maid@sweepro.com` | **Password:** `maid123`
- **Email:** `maid2@sweepro.com` | **Password:** `maid2123`
- **Email:** `maid3@sweepro.com` | **Password:** `maid3123`
- **Email:** `maid4@sweepro.com` | **Password:** `maid4123`
- **Email:** `maid5@sweepro.com` | **Password:** `maid5123`

### **Admin Account (for testing `/bookings`)**
- **Email:** `admin@sweepro.com` | **Password:** `admin123`

## 🔑 **Getting JWT Token**

### **Step 1: Login to get JWT Token**
```
POST {{base_url}}/api/auth/login
Content-Type: application/json

{
  "email": "customer@sweepro.com",
  "password": "customer123"
}
```

**Response:**
```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": { ... }
}
```

**Copy the `token` value for use in other requests.**

## 📊 **Test Data Overview**

After seeding, you'll have **14 bookings** with different statuses:

| Status | Count | Description |
|--------|-------|-------------|
| **CONFIRMED** | 5 | New bookings, no maid assigned yet |
| **ASSIGNED** | 2 | Maid assigned, not started |
| **IN_PROGRESS** | 1 | Currently being serviced |
| **COMPLETED** | 2 | Finished bookings (past dates) |
| **CANCELLED** | 2 | Cancelled bookings |
| **RESCHEDULED** | 1 | Rescheduled to future date |
| **NO_SHOW** | 1 | Customer didn't show up |

## 🧪 **API Endpoints to Test**

### **1. Get User Bookings with Filtering**

#### **All Bookings (Default)**
```
GET {{base_url}}/api/bookings/my-bookings
Authorization: Bearer {{jwt_token}}
```

#### **Scheduled Bookings**
```
GET {{base_url}}/api/bookings/my-bookings?status=scheduled
Authorization: Bearer {{jwt_token}}
```
*Should return: CONFIRMED (5) + ASSIGNED (2) + IN_PROGRESS (1) = 8 bookings*

#### **Completed Bookings**
```
GET {{base_url}}/api/bookings/my-bookings?status=completed
Authorization: Bearer {{jwt_token}}
```
*Should return: 2 COMPLETED bookings*

#### **Cancelled Bookings**
```
GET {{base_url}}/api/bookings/my-bookings?status=cancelled
Authorization: Bearer {{jwt_token}}
```
*Should return: 2 CANCELLED bookings*

### **2. Get Maid Bookings with Filtering**

#### **All Assignments**
```
GET {{base_url}}/api/bookings/my-assignments
Authorization: Bearer {{maid_jwt_token}}
```

#### **Filtered Assignments**
```
GET {{base_url}}/api/bookings/my-assignments?status=scheduled
Authorization: Bearer {{maid_jwt_token}}
```

### **3. Get All Bookings (Admin Only)**

#### **All Bookings**
```
GET {{base_url}}/api/bookings
Authorization: Bearer {{admin_jwt_token}}
```

#### **With Pagination**
```
GET {{base_url}}/api/bookings?page=1&limit=5
Authorization: Bearer {{admin_jwt_token}}
```

#### **With Status Filter**
```
GET {{base_url}}/api/bookings?status=scheduled&page=1&limit=10
Authorization: Bearer {{admin_jwt_token}}
```

### **4. Get Booking Statistics**

#### **Customer Stats**
```
GET {{base_url}}/api/bookings/stats
Authorization: Bearer {{customer_jwt_token}}
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "total": 14,
    "scheduled": 8,
    "completed": 2,
    "cancelled": 2
  },
  "filters": ["all", "scheduled", "completed", "cancelled"]
}
```

#### **Maid Stats**
```
GET {{base_url}}/api/bookings/stats
Authorization: Bearer {{maid_jwt_token}}
```

## 📝 **Postman Collection Setup**

### **1. Environment Variables**
Create a new environment in Postman with these variables:

```
base_url: http://localhost:3000
jwt_token: (leave empty, will be set after login)
customer_jwt_token: (leave empty, will be set after login)
maid_jwt_token: (leave empty, will be set after login)
admin_jwt_token: (leave empty, will be set after login)
```

### **2. Pre-request Scripts**
For the login requests, add this pre-request script to automatically set the token:

```javascript
// For customer login
pm.test("Login successful", function () {
    pm.response.to.have.status(200);
    var jsonData = pm.response.json();
    if (jsonData.token) {
        pm.environment.set("customer_jwt_token", jsonData.token);
    }
});

// For maid login  
pm.test("Login successful", function () {
    pm.response.to.have.status(200);
    var jsonData = pm.response.json();
    if (jsonData.token) {
        pm.environment.set("maid_jwt_token", jsonData.token);
    }
});

// For admin login
pm.test("Login successful", function () {
    pm.response.to.have.status(200);
    var jsonData = pm.response.json();
    if (jsonData.token) {
        pm.environment.set("admin_jwt_token", jsonData.token);
    }
});
```

## 🎯 **Testing Scenarios**

### **Scenario 1: Customer Booking Filters**
1. Login as `customer@sweepro.com`
2. Test `/my-bookings` with no filter (should return all 14 bookings)
3. Test `/my-bookings?status=scheduled` (should return 8 bookings)
4. Test `/my-bookings?status=completed` (should return 2 bookings)
5. Test `/my-bookings?status=cancelled` (should return 2 bookings)
6. Test `/stats` to verify counts

### **Scenario 2: Maid Assignment Filters**
1. Login as `maid@sweepro.com`
2. Test `/my-assignments` with different status filters
3. Verify only bookings assigned to this maid are returned

### **Scenario 3: Admin Overview**
1. Login as `admin@sweepro.com`
2. Test `/bookings` with pagination
3. Test `/bookings` with status filters
4. Verify all bookings across all customers are visible

## 🔍 **Expected Filter Results**

### **Scheduled Filter** (`status=scheduled`)
- **Includes:** CONFIRMED, ASSIGNED, IN_PROGRESS
- **Expected Count:** 8 bookings
- **Purpose:** Shows all active/upcoming bookings

### **Completed Filter** (`status=completed`)
- **Includes:** COMPLETED
- **Expected Count:** 2 bookings
- **Purpose:** Shows finished services

### **Cancelled Filter** (`status=cancelled`)
- **Includes:** CANCELLED
- **Expected Count:** 2 bookings
- **Purpose:** Shows cancelled services

## 📋 **Response Format Verification**

All responses should follow this structure:

```json
{
  "success": true,
  "data": [...bookings],
  "filters": {
    "applied": "scheduled",
    "available": ["all", "scheduled", "completed", "cancelled"]
  }
}
```

## 🚨 **Common Issues & Solutions**

### **Issue 1: 401 Unauthorized**
- **Cause:** Missing or invalid JWT token
- **Solution:** Re-login and get a fresh token

### **Issue 2: 403 Forbidden**
- **Cause:** Wrong user role for endpoint
- **Solution:** Use appropriate user account (customer/maid/admin)

### **Issue 3: Empty Results**
- **Cause:** Database not seeded or wrong user
- **Solution:** Run `npm run seed` and verify user credentials

### **Issue 4: Wrong Filter Counts**
- **Cause:** Database state mismatch
- **Solution:** Check seed data and verify booking statuses

## ✅ **Success Criteria**

Your API is working correctly if:

1. ✅ **All endpoints return 200 status**
2. ✅ **Filter counts match expected values**
3. ✅ **Response format is consistent**
4. ✅ **Bookings are ordered by scheduledAt desc**
5. ✅ **Stats endpoint returns accurate counts**
6. ✅ **Pagination works for admin endpoints**

## 🎉 **Next Steps**

Once testing is complete:

1. **Frontend Integration:** Use the response format to build filter UI
2. **Real-time Updates:** Consider WebSocket integration for live updates
3. **Performance:** Add caching for frequently accessed data
4. **Analytics:** Track filter usage patterns

---

**Happy Testing! 🚀**

If you encounter any issues, check the server logs and verify the database state with `npx prisma studio`.
