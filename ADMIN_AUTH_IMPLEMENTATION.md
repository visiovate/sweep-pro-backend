# Simple Admin Authentication System - Implementation Guide

## Overview

This document describes the simple yet significant admin authentication system implemented for Sweepro. The system uses email-based OTP for Multi-Factor Authentication (MFA), enhanced password security, audit logging, and optional IP whitelisting.

## Features Implemented

### 1. Environment-Based Admin Creation ✅
- Admin credentials are now set via environment variables
- No hardcoded passwords in seed.js
- `ADMIN_PASSWORD` is required in production
- Auto-verifies admin email on creation

### 2. One-Time Admin Setup Endpoint ✅
- `POST /api/admin/auth/setup` - Creates first admin if none exists
- Only works when no admin account exists
- Enforces strong password requirements
- Auto-locks after first admin is created

### 3. Email-Based OTP MFA ✅
- Two-step login process:
  1. Enter email/password → OTP sent to email
  2. Enter OTP → Complete login
- Uses existing OTP service with new types: `ADMIN_LOGIN`, `ADMIN_PASSWORD_RESET`
- OTP expires in 15 minutes
- Prevents unauthorized access even if password is compromised

### 4. Enhanced Password Security ✅
- **Minimum 12 characters** (increased from 8)
- **Must contain**: lowercase, uppercase, digit, special character (@$!%*?&)
- Applied to admin setup and password reset
- Account lockout after 5 failed attempts (15 minutes)

### 5. Admin Session Timeout ✅
- **30-minute session timeout** (vs 24h/7d for regular users)
- Shorter sessions reduce risk of stolen tokens
- Automatic re-authentication required after timeout

### 6. Strict Rate Limiting ✅
- **3 attempts per 15 minutes** for admin login (stricter than regular auth)
- Applied to `/api/admin/auth/login` and `/api/admin/auth/verify-otp`
- Prevents brute force attacks

### 7. Comprehensive Audit Logging ✅
- All admin actions logged with:
  - Admin ID, action, resource
  - IP address, user agent
  - Success/failure status
  - Timestamp
- Stored in `AdminAuditLog` table
- Queryable via audit service

### 8. Optional IP Whitelisting ✅
- Restrict admin access to specific IPs via `ALLOWED_ADMIN_IPS`
- Comma-separated list of allowed IPs
- If not set, allows all IPs (backward compatible)
- Applied to all admin auth routes

### 9. Secure Password Reset ✅
- `POST /api/admin/auth/request-password-reset` - Request reset OTP
- `POST /api/admin/auth/reset-password` - Reset with OTP
- Invalidates all existing sessions on password change
- Account enumeration protection (always returns success)

---

## Database Schema Changes

### New Model: AdminAuditLog
```prisma
model AdminAuditLog {
  id          String   @id @default(uuid())
  adminId     String
  action      String   // e.g., "admin.login.success", "user.created"
  resource    String?  // e.g., "User:123", "Booking:456"
  changes     Json?    // Before/after state
  ipAddress   String?
  userAgent   String?
  success     Boolean
  errorMessage String?
  createdAt   DateTime @default(now())
  
  admin       User     @relation(fields: [adminId], references: [id], onDelete: Cascade)
  
  @@index([adminId])
  @@index([action])
  @@index([createdAt])
  @@index([success])
}
```

### Updated OtpType Enum
```prisma
enum OtpType {
  EMAIL_VERIFICATION
  PASSWORD_RESET
  MFA
  ADMIN_LOGIN        // NEW
  ADMIN_PASSWORD_RESET // NEW
}
```

### Updated User Model
```prisma
model User {
  // ... existing fields
  adminAuditLogs  AdminAuditLog[] // NEW relation
}
```

---

## API Endpoints

### Admin Setup (One-Time)
```http
POST /api/admin/auth/setup
Content-Type: application/json

{
  "email": "admin@sweepro.com",
  "password": "StrongPassword123!@#",
  "name": "Admin User",
  "phone": "9876543210"
}

Response (201):
{
  "success": true,
  "message": "Admin setup successful. Please log in.",
  "data": {
    "email": "admin@sweepro.com",
    "name": "Admin User"
  }
}
```

### Admin Login (Step 1: Request OTP)
```http
POST /api/admin/auth/login
Content-Type: application/json

{
  "email": "admin@sweepro.com",
  "password": "StrongPassword123!@#"
}

Response (200):
{
  "success": true,
  "message": "OTP sent to your email. Please verify to complete login.",
  "data": {
    "email": "admin@sweepro.com",
    "requiresOtp": true
  }
}
```

### Admin Login (Step 2: Verify OTP)
```http
POST /api/admin/auth/verify-otp
Content-Type: application/json

{
  "email": "admin@sweepro.com",
  "otp": "123456"
}

Response (200):
{
  "success": true,
  "message": "Login successful",
  "data": {
    "user": {
      "id": "uuid",
      "name": "Admin User",
      "email": "admin@sweepro.com",
      "role": "ADMIN"
    },
    "token": "jwt_token_here"
  }
}
```

### Request Password Reset
```http
POST /api/admin/auth/request-password-reset
Content-Type: application/json

{
  "email": "admin@sweepro.com"
}

Response (200):
{
  "success": true,
  "message": "If an admin account exists for that email, a reset OTP has been sent."
}
```

### Reset Password with OTP
```http
POST /api/admin/auth/reset-password
Content-Type: application/json

{
  "email": "admin@sweepro.com",
  "otp": "123456",
  "newPassword": "NewStrongPassword456!@#",
  "confirmPassword": "NewStrongPassword456!@#"
}

Response (200):
{
  "success": true,
  "message": "Password reset successful. Please log in with your new password."
}
```

---

## Environment Variables

### Required in Production
```bash
# Admin Authentication
ADMIN_EMAIL=admin@sweepro.com
ADMIN_PASSWORD=your-strong-password-here-123!@#
ADMIN_NAME=Admin User
ADMIN_PHONE=9876543210
```

### Optional Security
```bash
# IP Whitelisting (comma-separated)
ALLOWED_ADMIN_IPS=127.0.0.1,10.0.0.1,192.168.1.100
```

**Note**: If `ALLOWED_ADMIN_IPS` is not set or empty, IP whitelisting is disabled (allows all IPs).

---

## Password Requirements

Admin passwords must meet ALL of the following:
- **Minimum 12 characters**
- At least one lowercase letter (a-z)
- At least one uppercase letter (A-Z)
- At least one digit (0-9)
- At least one special character (@$!%*?&)

**Examples**:
- ✅ `SecurePass123!@#`
- ✅ `MyAdmin@2024$`
- ❌ `password123` (no uppercase, no special char)
- ❌ `Password!` (too short, no digit)
- ❌ `PASSWORD123!` (no lowercase)

---

## Security Features Summary

| Feature | Implementation | Benefit |
|---------|---------------|---------|
| Environment-based admin creation | `ADMIN_PASSWORD` required in production | No hardcoded credentials |
| One-time setup endpoint | Only works if no admin exists | Prevents unauthorized admin creation |
| Email OTP MFA | Two-step login with OTP | Prevents access with stolen password |
| Enhanced password complexity | 12+ chars, mixed case, special char | Stronger passwords |
| 30-minute session timeout | JWT expires in 30m | Reduces risk of stolen tokens |
| Strict rate limiting | 3 attempts/15min | Prevents brute force |
| Audit logging | All admin actions logged | Traceability and compliance |
| IP whitelisting | Optional IP restriction | Network-level access control |
| Account lockout | 5 failed attempts = 15min lock | Prevents guessing attacks |
| Session invalidation | Password change invalidates sessions | Prevents session hijacking |

---

## Migration Instructions

### 1. Update Database Schema
```bash
# Generate migration
npx prisma migrate dev --name add_admin_audit_log

# Apply migration
npx prisma migrate deploy
```

### 2. Update Environment Variables
Add to your `.env` file (production):
```bash
ADMIN_EMAIL=admin@sweepro.com
ADMIN_PASSWORD=your-strong-password-here-123!@#
ADMIN_NAME=Admin User
ADMIN_PHONE=9876543210
```

Optional (for IP whitelisting):
```bash
ALLOWED_ADMIN_IPS=127.0.0.1,10.0.0.1
```

### 3. Run Seed Script
```bash
# This will create admin using environment variables
npx prisma db seed
```

### 4. Restart Application
```bash
npm start
```

---

## Testing the Implementation

### Test 1: Admin Setup (First Time)
```bash
# Only works if no admin exists
curl -X POST http://localhost:3000/api/admin/auth/setup \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@sweepro.com",
    "password": "TestPassword123!@#",
    "name": "Test Admin",
    "phone": "9876543210"
  }'
```

### Test 2: Admin Login Flow
```bash
# Step 1: Request OTP
curl -X POST http://localhost:3000/api/admin/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@sweepro.com",
    "password": "TestPassword123!@#"
  }'

# Step 2: Verify OTP (use OTP from email)
curl -X POST http://localhost:3000/api/admin/auth/verify-otp \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@sweepro.com",
    "otp": "123456"
  }'
```

### Test 3: Password Reset
```bash
# Request reset
curl -X POST http://localhost:3000/api/admin/auth/request-password-reset \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@sweepro.com"}'

# Reset with OTP
curl -X POST http://localhost:3000/api/admin/auth/reset-password \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@sweepro.com",
    "otp": "123456",
    "newPassword": "NewPassword456!@#",
    "confirmPassword": "NewPassword456!@#"
  }'
```

### Test 4: Rate Limiting
```bash
# Try 4 times (should fail on 4th attempt)
for i in {1..4}; do
  curl -X POST http://localhost:3000/api/admin/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email":"admin@sweepro.com","password":"wrong"}'
  echo "---"
done
```

### Test 5: IP Whitelisting (if configured)
```bash
# Should work from allowed IP
curl -X POST http://localhost:3000/api/admin/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@sweepro.com","password":"TestPassword123!@#"}'

# Should fail from non-allowed IP (use different IP)
curl -X POST http://localhost:3000/api/admin/auth/login \
  -H "Content-Type: application/json" \
  -H "X-Forwarded-For: 192.168.1.999" \
  -d '{"email":"admin@sweepro.com","password":"TestPassword123!@#"}'
```

---

## Files Created/Modified

### New Files
- `src/controllers/adminAuthController.js` - Admin authentication logic
- `src/services/adminAuditService.js` - Audit logging service
- `src/routes/adminAuthRoutes.js` - Admin auth routes
- `src/middleware/ipWhitelist.js` - IP whitelist middleware

### Modified Files
- `prisma/seed.js` - Environment-based admin creation
- `prisma/schema.prisma` - Added AdminAuditLog model, new OTP types
- `src/middleware/rateLimiters.js` - Added adminAuthRateLimiter
- `.env.example.aws` - Added admin environment variables
- `src/index.js` - Registered admin auth routes

---

## Deployment Checklist

### Before Deploying to Production
- [ ] Run database migration: `npx prisma migrate deploy`
- [ ] Set `ADMIN_EMAIL` in production environment
- [ ] Set `ADMIN_PASSWORD` (strong, 12+ chars) in production environment
- [ ] Set `ADMIN_NAME` in production environment
- [ ] Set `ADMIN_PHONE` in production environment
- [ ] (Optional) Set `ALLOWED_ADMIN_IPS` for IP whitelisting
- [ ] Test admin login flow in staging environment
- [ ] Verify email OTP delivery works
- [ ] Verify audit logs are being created
- [ ] Test rate limiting
- [ ] Test IP whitelisting (if configured)

### Post-Deployment
- [ ] Verify admin can log in with new system
- [ ] Check audit logs are populating
- [ ] Monitor rate limiting headers
- [ ] Test password reset flow
- [ ] Verify session timeout (30 minutes)

---

## Troubleshooting

### Issue: Admin setup endpoint returns 403
**Solution**: An admin already exists. The setup endpoint only works once.

### Issue: OTP not received
**Solution**: Check email service configuration (SMTP settings). Verify email delivery logs.

### Issue: Rate limiting too strict
**Solution**: Adjust `adminAuthRateLimiter` in `src/middleware/rateLimiters.js`.

### Issue: IP whitelist blocking legitimate access
**Solution**: Add your IP to `ALLOWED_ADMIN_IPS` or leave it empty to disable.

### Issue: Password validation failing
**Solution**: Ensure password meets all requirements (12+ chars, mixed case, digit, special char).

### Issue: Session expiring too quickly
**Solution**: Adjust JWT expiry in `adminAuthController.js` (currently 30 minutes).

---

## Security Best Practices

1. **Use Strong Passwords**: Always use passwords that meet the complexity requirements.
2. **Enable IP Whitelisting**: Restrict admin access to known IPs in production.
3. **Monitor Audit Logs**: Regularly review admin audit logs for suspicious activity.
4. **Rotate Passwords**: Change admin passwords periodically.
5. **Use Environment Variables**: Never commit admin credentials to code.
6. **Enable Email Delivery**: Ensure SMTP is properly configured for OTP delivery.
7. **Test Rate Limiting**: Verify rate limiting works as expected.
8. **Monitor Failed Logins**: Set up alerts for multiple failed login attempts.

---

## Compliance Notes

This implementation addresses several compliance requirements:

### GDPR
- ✅ Audit logging provides traceability
- ✅ Data protection through strong authentication
- ✅ Session timeout reduces data exposure

### SOC2
- ✅ Access logging (audit logs)
- ✅ Multi-factor authentication (OTP)
- ✅ Access controls (IP whitelisting)

### General Security
- ✅ Strong password policies
- ✅ Account lockout mechanisms
- ✅ Rate limiting
- ✅ Session management

---

## Support

For issues or questions:
1. Check the troubleshooting section above
2. Review audit logs for error details
3. Check email service logs for OTP delivery issues
4. Verify environment variables are set correctly

---

**Document Version**: 1.0  
**Last Updated**: 2026-07-07  
**Status**: Production Ready
