# Sweep Pro – Backend API

Node.js / Express REST + WebSocket API for the Sweep Pro cleaning-service platform.

---

## Quick Start

```bash
npm install
cp .env.example .env   # fill in all required values
npm run dev
```

---

## Environment Variables

### Required (app will refuse to start if missing)

| Variable | Min length | Description |
|---|---|---|
| `JWT_SECRET` | 32 chars | JWT signing secret. Generate with: `openssl rand -hex 32` |
| `DATABASE_URL` | – | PostgreSQL connection string (`postgresql://user:pass@host:5432/db`) |
| `RAZORPAY_WEBHOOK_SECRET` | 20 chars | Webhook signature key from Razorpay dashboard |

### Recommended

| Variable | Description |
|---|---|
| `RAZORPAY_TEST_KEY_ID` | Razorpay API key ID |
| `RAZORPAY_TEST_KEY_SECRET` | Razorpay API key secret |
| `FIREBASE_PROJECT_ID` | Firebase project ID |
| `FIREBASE_CLIENT_EMAIL` | Firebase service-account email |
| `FIREBASE_PRIVATE_KEY` | Firebase service-account private key (newlines as `\n`) |
| `NODE_ENV` | `development` \| `production` \| `test` |
| `PORT` | HTTP port (default: `3000`) |
| `FRONTEND_URL` | Allowed CORS origin (e.g. `https://your-frontend.com`) |
| `AUTH_FORCE_USER_REFRESH` | Set to `true` to always re-fetch the user record on each request |

### Redis / BullMQ

| Variable | Default | Description |
|---|---|---|
| `REDIS_HOST` | `127.0.0.1` | Redis server hostname |
| `REDIS_PORT` | `6379` | Redis server port |

> Redis is required for the BullMQ background workers (assignment, subscriptions). The main HTTP API starts without Redis but worker scripts will fail.

---

## Production Deployment Checklist

- [ ] All **Required** env vars above are set with real, non-placeholder values
- [ ] `NODE_ENV=production`
- [ ] `JWT_SECRET` is at least 32 characters of high-entropy random bytes
- [ ] HTTPS is terminated at the load balancer / reverse proxy
- [ ] The PostgreSQL database URL points to the production instance
- [ ] Redis is accessible by the worker processes
- [ ] Firebase Console: restrict API key to authorized domains only (see `src/config/firebase.js`)

---

## Security Hardening (M-series)

The following fixes were applied as part of the production hardening pass:

### M1 – Removed `require.cache` bust
`paymentController.js` previously deleted its own cached `razorpayService` module on every request. This has been removed; the service is now a proper singleton.

### M2 – Structured Winston logging in auth middleware
`src/utils/logger.js` provides a Winston-based structured logger.
- `TokenExpiredError` is logged at `info` (normal session expiry).
- `JsonWebTokenError` is logged at `warn` (possible tampering).
- Unexpected errors log the stack trace in `development` only; in `production` only the message is emitted.

### M3 – Pagination on `GET /payments/my-payments`
The endpoint now accepts `?page=<n>&limit=<n>` query parameters.
- Default: `page=1`, `limit=20`
- Hard cap: `limit` is clamped to a maximum of **100**
- Response shape: `{ data: [...], pagination: { total, page, limit, totalPages } }`

### M4 – N+1 query fix in assignment conflict check
`customerAssignmentController.js` `checkMaidAssignmentConflicts()` previously issued a nested `prisma.user.findMany` inside a `.then()` for every maid in a loop. It now uses the `userId` already present on the `maidProfile` record from the preceding capacity-check query.

### M5 – Firebase key security documentation
`src/config/firebase.js` carries a detailed JSDoc block explaining that Firebase **client** API keys must be restricted in the Firebase Console:
- Restrict to authorized domains only.
- Apply API restrictions (only enable services you use).
- Disable unused Firebase services.

A `warnIfUnknownDomain()` runtime helper logs a warning when the server is running on an unrecognized origin.

### M6 – HttpOnly cookie-based JWT storage

**Backend (`src/routes/authRoutes.js`)**
- `POST /auth/register` and `POST /auth/login` now call `res.cookie('authToken', token, { httpOnly: true, secure: <prod-only>, sameSite: 'strict', maxAge: ... })` after signing the JWT.
- `POST /auth/logout` calls `res.clearCookie('authToken', ...)` to invalidate the session.
- The insecure `process.env.JWT_SECRET || 'your-secret-key'` fallback in the login route has been replaced with `getJwtSecret()`.

**Auth middleware (`src/middleware/auth.js`)**
The `extractToken()` helper checks the `Authorization: Bearer` header first, then falls back to `req.cookies.authToken`.

**Frontend (`src/services/api.ts`)**
- All `fetch` calls now include `credentials: 'include'` so the browser sends the auth cookie automatically.
- A `getCookieValue()` helper reads the non-HttpOnly `csrf-token` cookie and attaches it as the `X-CSRF-Token` header on every state-changing request.

**Frontend (`src/services/authService.ts`)**
- `login()` and `register()` no longer call `setAuthToken()` (the JWT lives in the HttpOnly cookie, not `localStorage`).
- `isAuthenticated()` checks for the cached user profile in `localStorage` instead of the token.
- `logout()` calls `POST /auth/logout` (backend clears the cookie) before clearing local state.

### M7 – CSRF protection (double-submit cookie)

`src/middleware/csrf.js` implements the double-submit cookie pattern:
1. Every response sets a non-HttpOnly `csrf-token` cookie.
2. State-changing requests (POST / PUT / PATCH / DELETE) must echo the cookie value in the `X-CSRF-Token` header.
3. A mismatch returns **403 CSRF_INVALID**.

Exempt paths:
- `POST /api/payments/razorpay/webhook` – signed by Razorpay with HMAC, no browser involved.

The CORS configuration includes `X-CSRF-Token` in `Access-Control-Allow-Headers`.

### M8 – WebSocket authentication on upgrade handshake

`src/index.js` intercepts the HTTP `upgrade` event before the WebSocket handshake completes. The handler:
1. Extracts a JWT from `?token=` query param, `Authorization: Bearer` header, or `authToken` cookie.
2. Verifies the token with `getJwtSecret()`.
3. Rejects unauthenticated connections with HTTP **401**.
4. Attaches `ws.user = { id, role }` on success.

### Additional – Helmet security headers
`helmet` is applied in `src/index.js`. CSP is disabled in development to avoid breaking hot-reload tools; the default helmet CSP is active in production.

---

## Running Tests

```bash
npm test                        # all test suites
npm test -- --testPathPattern=security.test.js   # security hardening tests only
npm run test:coverage           # with coverage report
```

The `src/tests/security.test.js` suite covers all M-series fixes and does not require a running database or Redis instance.

---

## Workers & Cron Jobs

| Script | Command |
|---|---|
| Assignment worker | `npm run worker` |
| Subscription worker | `npm run worker:subscription` |
| Admin reassignment worker | `npm run reassign-worker` |
| Assignment cron | `npm run cron:assignment` |
| Expired-request cron | `npm run cron:expired` |
| Subscription cron | `npm run cron:subscriptions` |

Workers require Redis. Set `REDIS_HOST` / `REDIS_PORT` accordingly.
