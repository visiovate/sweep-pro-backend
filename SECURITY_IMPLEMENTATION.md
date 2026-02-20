
# SECURITY FIXES - QUICK REFERENCE FOR DEVELOPERS

## What Changed?

### 4 Critical Security Issues Have Been Fixed

#### 1️⃣ JWT Secret Hardening ✅
- **Why**: Application was using default fallback secret if JWT_SECRET not set
- **What Changed**:
  - Created `src/config/validateEnv.js` to validate environment at startup
  - App now CRASHES if JWT_SECRET is missing
  - All JWT operations use `getJwtSecret()` instead of direct env access
- **Impact on You**: Set `JWT_SECRET` (32+ chars) in your `.env` or app won't start

#### 2️⃣ Rate Limiting Added ✅
- **Why**: No protection against brute force and DDoS attacks
- **What Changed**:
  - Added `express-rate-limit` package
  - Created 4 specialized rate limiters in `src/middleware/rateLimiters.js`
  - Applied to auth (5/15min), payments (10/15min), global (100/15min)
- **Impact on You**: Repeated failed auth attempts will be blocked for 15 minutes

#### 3️⃣ Payment Amount Validation ✅
- **Why**: Frontend could manipulate payment amounts (CRITICAL FINANCIAL BUG)
- **What Changed**:
  - Payment endpoints now ignore `amount` param from frontend
  - Amount is fetched from database using bookingId/subscriptionId
  - Response includes verified server-side amount
- **Impact on You**: Always send only bookingId/subscriptionId, never amount

#### 4️⃣ Webhook Signature Verification Fixed ✅
- **Why**: Webhook signature was verified incorrectly, could be forged
- **What Changed**:
  - Created `src/middleware/webhookSignatureVerifier.js`
  - Webhook route now uses `express.raw()` to capture raw body
  - Signature verified using raw Buffer (how Razorpay signs it)
  - Webhook handler simplified - signature already verified
- **Impact on You**: No changes needed - handled automatically

---

## Files Created
```
src/config/validateEnv.js                      # Environment validation
src/middleware/rateLimiters.js                 # Rate limiting rules
src/middleware/webhookSignatureVerifier.js     # Webhook security
```

## Files Modified
```
src/index.js                                   # +Environment validation, +global rate limiter
src/middleware/auth.js                         # JWT secret getter
src/routes/authRoutes.js                       # JWT secret getter
src/controllers/userController.js              # JWT secret getter
src/controllers/paymentController.js           # Payment amount validation, webhook handler
src/routes/paymentRoutes.js                    # Webhook middleware, payment limiter
```

---

## Environment Setup Required

### Before Testing/Deployment
```bash
# Generate a 64-character random secret for JWT
JWT_SECRET=$(openssl rand -hex 32)

# Your .env file MUST have:
JWT_SECRET=<your-64-char-secret>
DATABASE_URL=postgresql://...
RAZORPAY_WEBHOOK_SECRET=<from-razorpay-dashboard>
RAZORPAY_TEST_KEY_ID=<from-razorpay>
RAZORPAY_TEST_KEY_SECRET=<from-razorpay>
```

### Verification
```bash
# App should start successfully
npm start

# Check logs for:
# ✅ [SECURITY] All critical environment variables validated successfully
```

---

## API Changes

### ❌ BREAKING: Payment Order Creation

#### Booking Payment - BEFORE
```json
POST /api/payments/razorpay/booking/create-order
{
  "bookingId": "booking123",
  "amount": 1500,         // ❌ IGNORED NOW
  "currency": "INR"       // ❌ IGNORED NOW
}
```

#### Booking Payment - AFTER
```json
POST /api/payments/razorpay/booking/create-order
{
  "bookingId": "booking123"  // ✅ ONLY THIS NEEDED
}

Response: {
  "order": {...},
  "amount": 1500,           // ✅ Amount returned by server
  "currency": "INR"
}
```

#### Subscription Payment - BEFORE
```json
POST /api/payments/razorpay/subscription/create-order
{
  "subscriptionId": "sub123",
  "amount": 5000,        // ❌ IGNORED NOW
  "currency": "INR"      // ❌ IGNORED NOW
}
```

#### Subscription Payment - AFTER
```json
POST /api/payments/razorpay/subscription/create-order
{
  "subscriptionId": "sub123"  // ✅ ONLY THIS NEEDED
}

Response: {
  "order": {...},
  "amount": 5000,           // ✅ Amount returned by server
  "currency": "INR"
}
```

---

## Rate Limiting Limits

| Endpoint | Limit | Window | Status Code |
|---|---|---|---|
| `/api/auth/*` | 5 attempts | 15 minutes | 429 |
| `/api/payments/*` | 10 attempts | 15 minutes | 429 |
| All `/api/*` | 100 requests | 15 minutes | 429 |
| Forgot password | 3 attempts | 1 hour | 429 |

Rate limit info returned in response headers:
```
X-RateLimit-Limit: 5
X-RateLimit-Remaining: 2
X-RateLimit-Reset: <timestamp>
```

---

## Testing Checklist

### ✅ JWT Validation
```bash
# Should fail (no JWT_SECRET)
unset JWT_SECRET
npm start
# Expected: Application exits with security error

# Should succeed (valid JWT_SECRET)
JWT_SECRET=$(openssl rand -hex 32) npm start
```

### ✅ Rate Limiting
```bash
# 6 failed logins should trigger 429
for i in {1..6}; do
  curl -X POST http://localhost:3000/api/auth/login \
    -d '{"email":"test@example.com","password":"wrong"}'
done
# Response 6: 429 Too Many Requests
```

### ✅ Payment Amount Validation
```bash
# Amount should come from database, not request
curl -X POST http://localhost:3000/api/payments/razorpay/booking/create-order \
  -H "Authorization: Bearer TOKEN" \
  -d '{"bookingId":"booking123"}'
# Response should contain server-calculated amount
```

### ✅ Webhook Verification
```bash
# Invalid signature should fail
curl -X POST http://localhost:3000/api/payments/razorpay/webhook \
  -H "X-Razorpay-Signature: invalid" \
  -d '{"event":"payment.captured",...}'
# Response: 401 Unauthorized
```

---

## Common Issues

### Issue: "JWT_SECRET is not properly configured"
**Solution**: Set valid JWT_SECRET in .env
```bash
export JWT_SECRET=$(openssl rand -hex 32)
```

### Issue: 429 Too Many Requests on login
**Solution**: This is rate limiting working correctly
- Wait 15 minutes or
- Test from different IP/device or
- Change IP in development (use proxy or VPN)

### Issue: Payment endpoint returns 400 "Missing required field"
**Solution**: Don't send `amount` parameter
- Old: `{bookingId, amount}` ❌
- New: `{bookingId}` ✅

### Issue: Webhook always returns 401
**Solution**: Check RAZORPAY_WEBHOOK_SECRET in environment
```bash
echo $RAZORPAY_WEBHOOK_SECRET  # Should be set
```

---

## Documentation Files
- **Detailed**: See `SECURITY_FIXES.md` for comprehensive explanation
- **This File**: Quick reference for developers
- **Code Comments**: Added to all security-related code

---

## Summary

**All 4 critical security vulnerabilities have been fixed.**

The application is now:
- ✅ Protected against JWT attacks
- ✅ Protected against brute force and DDoS
- ✅ Protected against payment manipulation
- ✅ Protected against webhook forgery

**Ready for production deployment** with proper environment configuration.
