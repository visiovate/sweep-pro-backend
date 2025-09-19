# Buffer System API Testing Guide

## 📋 **How to Use the Postman Collection**

### **Step 1: Import the Collection**
1. Open Postman
2. Click **"Import"** 
3. Select the file: `Buffer_System_API_Tests.postman_collection.json`
4. Click **"Import"**

### **Step 2: Set Variables (Optional)**
The collection includes default variables, but you can customize:
- `base_url` = `http://localhost:3000` (default)
- `auth_token` = Auto-populated after login
- `subscription_id` = Auto-populated from API responses
- `buffer_period_id` = Auto-populated when buffer periods are created

## 🧪 **Testing Scenarios**

### **Scenario 1: Customer Flow (Happy Path)**
**Test as a customer requesting buffer days:**

1. **Login as Customer** → `"Login as Customer (buffer@sweepro.com)"`
   - ✅ Should return success with JWT token
   
2. **Get Monthly Subscription Status** → `"Get Monthly Subscription Status"`
   - ✅ Should show active subscription with buffer day info
   - ✅ Auto-saves `subscription_id` variable
   
3. **Get Remaining Buffer Days** → `"Get Remaining Buffer Days"`
   - ✅ Should show total/used/remaining buffer days
   - ✅ Example: 3 total, 2 used, 1 remaining

4. **Request Buffer Days** → `"Request Buffer Days (3 days)"`
   - ✅ Should create pending buffer period request
   - ✅ Auto-saves `buffer_period_id` variable

5. **Get Buffer History** → `"Get Buffer Period History"`
   - ✅ Should show past and current buffer periods

### **Scenario 2: Admin Flow (Approval Process)**
**Test as admin approving buffer requests:**

1. **Login as Admin** → `"Login as Admin"`
   - ✅ Should authenticate admin successfully

2. **Get Pending Buffer Requests** → `"Get Pending Buffer Requests"`
   - ✅ Should show requests awaiting approval
   - ✅ Should include customer details and request info

3. **Get Buffer Statistics** → `"Get Buffer Statistics"`
   - ✅ Should show pending/active counts
   - ✅ Should show usage statistics

4. **Approve Buffer Request** → `"Approve Buffer Request"`
   - ✅ Should approve the request created in Customer Flow
   - ✅ Should return success message

5. **Get Affected Services** → `"Get Affected Services"`
   - ✅ Should show services impacted by buffer periods
   - ✅ Should show which services are skipped

### **Scenario 3: Error Handling**
**Test edge cases and error conditions:**

1. **Request Buffer Without Subscription**
   - Login as `customer2@sweepro.com` (if no active subscription)
   - Try to request buffer days
   - ✅ Should return appropriate error

2. **Exceed Buffer Day Limits**
   - Request more buffer days than allowed
   - ✅ Should return validation error

3. **Admin-Only Endpoints Without Admin Role**
   - Login as customer, try admin endpoints
   - ✅ Should return 403 Forbidden

## 🎯 **Test Data Available**

### **Customer Test Accounts:**
- `buffer@sweepro.com` / `buffer123` - Has ACTIVE buffer period
- `customer@sweepro.com` / `customer123` - Basic Plan subscriber
- `customer2@sweepro.com` / `customer2123` - Premium Plan subscriber
- `customer5@sweepro.com` / `customer5123` - Premium Plan (Nina Customer)

### **Admin Account:**
- `admin@sweepro.com` / `admin123` - Full admin access

## ✅ **Expected Results**

### **Successful Responses Should Show:**
```json
{
  "success": true,
  "message": "Operation successful",
  "data": {
    // Relevant data
  }
}
```

### **Buffer Period Structure:**
```json
{
  "id": "uuid",
  "subscriptionId": "uuid", 
  "startDate": "2025-01-15T00:00:00.000Z",
  "endDate": "2025-01-18T00:00:00.000Z",
  "status": "PENDING|ACTIVE|COMPLETED|CANCELLED",
  "reason": "Going on vacation",
  "daysCount": 3,
  "servicesSkipped": 2,
  "isAutomatic": false,
  "notes": "Will be traveling abroad"
}
```

### **Subscription Status Structure:**
```json
{
  "hasActiveSubscription": true,
  "subscription": {
    "id": "uuid",
    "status": "ACTIVE",
    "plan": { "name": "Basic Daily Cleaning" },
    "bufferDaysCount": 3,
    "bufferDaysUsed": 1,
    "isInBufferPeriod": false
  },
  "activeBuffer": null,
  "summary": {
    "bufferPeriodActive": false,
    "daysUntilBuffer": 28,
    "servicesThisMonth": 15
  }
}
```

## 🔧 **Troubleshooting**

### **Common Issues:**

1. **Authentication Fails (401)**
   - Check if backend server is running on port 3000
   - Verify credentials: `admin@sweepro.com` / `admin123`
   - Ensure seed data has been run

2. **Subscription Not Found**
   - Make sure you're logged in as a customer with active subscription
   - Run the seed script if database is empty
   - Check `subscription_id` variable is populated

3. **Buffer Period Not Found**
   - Ensure you've created a buffer request first
   - Check `buffer_period_id` variable is populated
   - Verify request wasn't already processed

### **Debugging Tips:**
1. **Check Console Output** - Each request logs detailed info to Postman console
2. **Verify Variables** - Check collection variables are being set correctly
3. **Check Response Body** - Look for detailed error messages in failed requests
4. **Test Health Endpoint** - Ensure backend is responding properly

## 🚀 **Advanced Testing**

### **Performance Testing:**
- Test concurrent buffer requests
- Test bulk admin operations
- Test large pagination results

### **Integration Testing:**
1. Create buffer request → Admin approve → Check affected services
2. Request buffer → Check monthly status → View history
3. Test full monthly cycle with buffer periods

### **Data Validation:**
- Verify buffer day limits are enforced
- Check date validations work correctly
- Confirm proper status transitions

---

## 🎯 **Success Criteria**

✅ **All endpoints return 200/201 for valid requests**  
✅ **Authentication works for all user types**  
✅ **Buffer requests can be created and approved**  
✅ **Statistics and history data is accurate**  
✅ **Error handling works for invalid requests**  
✅ **Admin can see all buffer-related data**

After running through these tests, your buffer system backend should be fully verified and ready for frontend integration!
