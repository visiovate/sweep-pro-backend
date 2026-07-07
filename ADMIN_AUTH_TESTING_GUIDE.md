# Admin Authentication System - Testing Guide

## Prerequisites

✅ Environment variables already set:
```bash
ADMIN_EMAIL=sweeproindia@gmail.com
ADMIN_PASSWORD=SweeproIndia@321
ADMIN_NAME=Sweepro Admin
ADMIN_PHONE=7330696872
```

---

## Testing Flow

### Step 1: Run Database Migration

First, apply the database schema changes to add the audit log table and new OTP types.

```bash
cd sweep-pro-backend
npx prisma migrate dev --name add_admin_audit_log
```

**Expected Output**:
```
Applying migration `20240707_add_admin_audit_log`
The following migration have been applied:
migrations/
  └─ 20240707_add_admin_audit_log/
    └─ migration.sql
```

---

### Step 2: Run Seed Script

This will create the admin user using your environment variables.

```bash
npx prisma db seed
```

**Expected Output**:
```
Seeding database...
✅ Admin user created: sweeproindia@gmail.com
```

**Note**: If admin already exists, it will update the existing admin.

---

### Step 3: Start the Server

Start the backend server to test the endpoints.

```bash
npm start
```

**Expected Output**:
```
Server running on port 3000
✅ [SECURITY] All critical environment variables validated successfully
```

---

### Step 4: Test Admin Authentication Flow

#### Test 4.1: Admin Setup (First Time Only)

**Note**: Skip this if admin already exists (from seed script).

```bash
curl -X POST http://localhost:3000/api/admin/auth/setup \
  -H "Content-Type: application/json" \
  -d '{
    "email": "sweeproindia@gmail.com",
    "password": "SweeproIndia@321",
    "name": "Sweepro Admin",
    "phone": "7330696872"
  }'
```

**Expected Response (201)**:
```json
{
  "success": true,
  "message": "Admin setup successful. Please log in.",
  "data": {
    "email": "sweeproindia@gmail.com",
    "name": "Sweepro Admin"
  }
}
```

**If admin already exists (403)**:
```json
{
  "success": false,
  "message": "Admin already exists. Setup can only be done once."
}
```

---

#### Test 4.2: Admin Login - Step 1 (Request OTP)

This sends an OTP to your email.

```bash
curl -X POST http://localhost:3000/api/admin/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "sweeproindia@gmail.com",
    "password": "SweeproIndia@321"
  }'
```

**Expected Response (200)**:
```json
{
  "success": true,
  "message": "OTP sent to your email. Please verify to complete login.",
  "data": {
    "email": "sweeproindia@gmail.com",
    "requiresOtp": true
  }
}
```

**Action Required**: Check your email (sweeproindia@gmail.com) for the OTP. The OTP is a 6-digit code.

---

#### Test 4.3: Admin Login - Step 2 (Verify OTP)

Use the OTP received in your email to complete login.

```bash
curl -X POST http://localhost:3000/api/admin/auth/verify-otp \
  -H "Content-Type: application/json" \
  -d '{
    "email": "sweeproindia@gmail.com",
    "otp": "123456"
  }'
```

**Replace `123456` with the actual OTP from your email.**

**Expected Response (200)**:
```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "user": {
      "id": "uuid-here",
      "name": "Sweepro Admin",
      "email": "sweeproindia@gmail.com",
      "role": "ADMIN"
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

**Save the token** - You'll need it for testing protected admin routes.

---

#### Test 4.4: Test Protected Admin Route

Use the token from step 4.3 to access a protected admin endpoint.

```bash
curl -X GET http://localhost:3000/api/admin/stats \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

**Replace `YOUR_TOKEN_HERE` with the token from step 4.3.**

**Expected Response (200)**:
```json
{
  "success": true,
  "data": {
    "users": { ... },
    "bookings": { ... },
    "subscriptions": { ... },
    "payments": { ... }
  }
}
```

---

### Step 5: Test Password Reset Flow

#### Test 5.1: Request Password Reset

```bash
curl -X POST http://localhost:3000/api/admin/auth/request-password-reset \
  -H "Content-Type: application/json" \
  -d '{
    "email": "sweeproindia@gmail.com"
  }'
```

**Expected Response (200)**:
```json
{
  "success": true,
  "message": "If an admin account exists for that email, a reset OTP has been sent."
}
```

**Action Required**: Check your email for the reset OTP.

---

#### Test 5.2: Reset Password with OTP

```bash
curl -X POST http://localhost:3000/api/admin/auth/reset-password \
  -H "Content-Type: application/json" \
  -d '{
    "email": "sweeproindia@gmail.com",
    "otp": "123456",
    "newPassword": "NewPassword456!@#",
    "confirmPassword": "NewPassword456!@#"
  }'
```

**Replace `123456` with the actual OTP from your email.**

**Expected Response (200)**:
```json
{
  "success": true,
  "message": "Password reset successful. Please log in with your new password."
}
```

---

### Step 6: Test Rate Limiting

Try multiple failed login attempts to trigger rate limiting.

```bash
# Attempt 1
curl -X POST http://localhost:3000/api/admin/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"sweeproindia@gmail.com","password":"wrong"}'

# Attempt 2
curl -X POST http://localhost:3000/api/admin/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"sweeproindia@gmail.com","password":"wrong"}'

# Attempt 3
curl -X POST http://localhost:3000/api/admin/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"sweeproindia@gmail.com","password":"wrong"}'

# Attempt 4 (should be rate limited)
curl -X POST http://localhost:3000/api/admin/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"sweeproindia@gmail.com","password":"wrong"}'
```

**Expected Response for Attempt 4 (429)**:
```json
{
  "success": false,
  "error": "Too many admin authentication attempts. Please try again after 15 minutes.",
  "retryAfter": "15 minutes",
  "timestamp": "2026-07-07T..."
}
```

---

### Step 7: Test Audit Logging

Check if audit logs are being created in the database.

```bash
npx prisma studio
```

This will open Prisma Studio in your browser. Navigate to:
1. **AdminAuditLog** table
2. Check for entries with actions like:
   - `admin.login.success`
   - `admin.login.otp_sent`
   - `admin.login.otp_failed`
   - `admin.password_reset_requested`

**Expected**: You should see audit log entries for each admin action performed.

---

### Step 8: Test IP Whitelisting (Optional)

If you want to test IP whitelisting, add this to your `.env`:

```bash
ALLOWED_ADMIN_IPS=127.0.0.1
```

Restart the server, then test:

```bash
# This should work (from allowed IP)
curl -X POST http://localhost:3000/api/admin/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"sweeproindia@gmail.com","password":"SweeproIndia@321"}'

# This should fail (from non-allowed IP)
curl -X POST http://localhost:3000/api/admin/auth/login \
  -H "Content-Type: application/json" \
  -H "X-Forwarded-For: 192.168.1.999" \
  -d '{"email":"sweeproindia@gmail.com","password":"SweeproIndia@321"}'
```

**Expected Response for Non-Allowed IP (403)**:
```json
{
  "success": false,
  "message": "Access denied from this IP address",
  "code": "IP_NOT_ALLOWED"
}
```

---

## Quick Testing Checklist

- [ ] Database migration applied successfully
- [ ] Seed script created admin user
- [ ] Server started without errors
- [ ] Admin login sends OTP to email
- [ ] OTP verification completes login
- [ ] Protected admin routes accessible with token
- [ ] Password reset flow works
- [ ] Rate limiting triggers after 3 failed attempts
- [ ] Audit logs are being created
- [ ] (Optional) IP whitelisting works

---

## Common Issues & Solutions

### Issue: Migration fails
**Solution**: Ensure your database is running and `DATABASE_URL` is set correctly.

### Issue: Seed script fails
**Solution**: Check that environment variables are set and password meets complexity requirements.

### Issue: OTP not received
**Solution**: 
- Check SMTP configuration in `.env`
- Check spam folder in email
- Verify email service is running

### Issue: Login fails with "Invalid credentials"
**Solution**: 
- Verify email and password are correct
- Check if account is locked (wait 15 minutes)
- Try password reset flow

### Issue: Rate limiting too strict during testing
**Solution**: 
- Wait 15 minutes for rate limit to reset
- Or temporarily disable rate limiting in code for testing

### Issue: Audit logs not appearing
**Solution**: 
- Check database connection
- Verify `AdminAuditLog` table was created
- Check server logs for errors

---

## Testing with Postman (Alternative)

If you prefer using Postman:

### Import Collection
Create a new collection with these requests:

1. **Admin Setup**
   - Method: POST
   - URL: `http://localhost:3000/api/admin/auth/setup`
   - Body (JSON):
     ```json
     {
       "email": "sweeproindia@gmail.com",
       "password": "SweeproIndia@321",
       "name": "Sweepro Admin",
       "phone": "7330696872"
     }
     ```

2. **Admin Login - Request OTP**
   - Method: POST
   - URL: `http://localhost:3000/api/admin/auth/login`
   - Body (JSON):
     ```json
     {
       "email": "sweeproindia@gmail.com",
       "password": "SweeproIndia@321"
     }
     ```

3. **Admin Login - Verify OTP**
   - Method: POST
   - URL: `http://localhost:3000/api/admin/auth/verify-otp`
   - Body (JSON):
     ```json
     {
       "email": "sweeproindia@gmail.com",
       "otp": "123456"
     }
     ```

4. **Get Admin Stats** (Protected)
   - Method: GET
   - URL: `http://localhost:3000/api/admin/stats`
   - Headers:
     - `Authorization: Bearer YOUR_TOKEN_HERE`

---

## Production Deployment Testing

Before deploying to production:

1. **Test in Staging Environment**
   - Deploy to staging
   - Run all tests above
   - Verify email OTP delivery
   - Check audit logs

2. **Verify Environment Variables**
   - Ensure `ADMIN_PASSWORD` is set in production
   - Ensure SMTP is configured for production
   - Set `ALLOWED_ADMIN_IPS` if needed

3. **Test with Production Database**
   - Run migration on production database
   - Run seed script
   - Test login flow
   - Verify audit logs

4. **Monitor First Login**
   - Watch server logs for errors
   - Check email delivery
   - Verify audit logs populate

---

## Success Criteria

The system is working correctly if:

✅ Admin can log in with email + password + OTP
✅ OTP is delivered to email within seconds
✅ Protected admin routes return data with valid token
✅ Invalid token returns 401 Unauthorized
✅ Password reset flow works end-to-end
✅ Rate limiting blocks after 3 failed attempts
✅ Audit logs record all admin actions
✅ Session expires after 30 minutes
✅ IP whitelisting blocks unauthorized IPs (if configured)

---

**Testing Guide Version**: 1.0  
**Last Updated**: 2026-07-07
