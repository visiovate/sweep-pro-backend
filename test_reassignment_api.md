# Test APIs for Reassignment Functionality

## 1. Get Reassignment Bookings (Admin)
**Endpoint:** `GET /api/assignments/admin/reassignment-bookings`
**Method:** GET
**Headers:**
```json
{
  "Authorization": "Bearer YOUR_ADMIN_JWT_TOKEN",
  "Content-Type": "application/json"
}
```

**Expected Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "booking_id",
      "status": "CANCELLED",
      "assignmentStatus": "REJECTED",
      "rejectionReason": "Not available at this time",
      "customer": {
        "name": "Customer Name",
        "email": "customer@email.com"
      },
      "service": {
        "name": "House Cleaning"
      },
      "lastRejectedBy": {
        "maidId": "maid_id",
        "maidName": "Maid Name",
        "rejectionReason": "Not available at this time",
        "rejectedAt": "2025-01-19T07:00:00.000Z"
      }
    }
  ]
}
```

## 2. Reject Assignment (Maid)
**Endpoint:** `POST /api/assignments/{assignmentId}/reject`
**Method:** POST
**Headers:**
```json
{
  "Authorization": "Bearer YOUR_MAID_JWT_TOKEN",
  "Content-Type": "application/json"
}
```

**Body:**
```json
{
  "rejectionReason": "Not available at this time"
}
```

**Expected Response:**
```json
{
  "success": true,
  "message": "Assignment rejected successfully",
  "data": {
    "id": "assignment_id",
    "status": "rejected",
    "rejectionReason": "Not available at this time"
  }
}
```

## 3. Get Pending Assignments (Maid)
**Endpoint:** `GET /api/assignments/pending`
**Method:** GET
**Headers:**
```json
{
  "Authorization": "Bearer YOUR_MAID_JWT_TOKEN",
  "Content-Type": "application/json"
}
```

## 4. Send Assignment Request (Admin)
**Endpoint:** `POST /api/assignments/admin/send-assignment-request`
**Method:** POST
**Headers:**
```json
{
  "Authorization": "Bearer YOUR_ADMIN_JWT_TOKEN",
  "Content-Type": "application/json"
}
```

**Body:**
```json
{
  "bookingId": "booking_id_here",
  "maidId": "maid_id_here",
  "expiresIn": 24
}
```

## 5. Debug Reassignment Status (Admin)
**Endpoint:** `GET /api/assignments/admin/debug/reassignment-status`
**Method:** GET
**Headers:**
```json
{
  "Authorization": "Bearer YOUR_ADMIN_JWT_TOKEN",
  "Content-Type": "application/json"
}
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "totalBookings": 2,
    "bookings": [
      {
        "id": "booking_id",
        "status": "CANCELLED",
        "assignmentStatus": "REJECTED",
        "rejectionReason": "Not available at this time",
        "maidId": null,
        "customer": "Customer Name",
        "service": "House Cleaning",
        "assignmentRequests": [
          {
            "id": "assignment_request_id",
            "status": "rejected",
            "maidName": "Maid Name",
            "rejectionReason": "Not available at this time",
            "respondedAt": "2025-01-19T07:00:00.000Z"
          }
        ]
      }
    ]
  }
}
```

## Testing Flow:

1. **Create a booking** (should be PENDING status)
2. **Send assignment request** to a maid using endpoint #4
3. **Maid rejects** the assignment using endpoint #2
4. **Check reassignment bookings** using endpoint #1 - the booking should appear here

## Postman Collection Setup:

### Environment Variables:
- `base_url`: http://localhost:3000
- `admin_token`: Your admin JWT token
- `maid_token`: Your maid JWT token

### Pre-request Scripts for Authentication:
```javascript
// For admin endpoints
pm.request.headers.add({
    key: 'Authorization',
    value: 'Bearer ' + pm.environment.get('admin_token')
});

// For maid endpoints  
pm.request.headers.add({
    key: 'Authorization',
    value: 'Bearer ' + pm.environment.get('maid_token')
});
```
