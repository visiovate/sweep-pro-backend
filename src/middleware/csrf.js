/**
 * CSRF Protection – Double-Submit Cookie Pattern
 *
 * How it works:
 *  1. On every request the server sets a short-lived `csrf-token` cookie
 *     (NOT httpOnly so the JS client can read it).
 *  2. State-changing requests (POST / PUT / PATCH / DELETE) must echo that
 *     value back in the `X-CSRF-Token` request header.
 *  3. The middleware compares the cookie value with the header value.
 *     A mismatch means the request did not originate from our SPA.
 *
 * Safe methods (GET, HEAD, OPTIONS) are always allowed.
 *
 * Exemptions (bypass list):
 *  - Razorpay webhook endpoint – signed with HMAC by Razorpay servers
 *  - Any route that explicitly opts out via res.locals.skipCsrf = true
 */

const crypto = require('crypto');

// Methods that mutate state and therefore require CSRF validation
const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

// Routes that should bypass CSRF (e.g. server-to-server webhooks, session bootstrap)
const CSRF_EXEMPT_PATHS = [
  // Webhook: signed by Razorpay with HMAC — no browser session involved
  '/api/payments/razorpay/webhook',

  // Session bootstrap endpoints: CSRF cannot be enforced here because
  // the csrf-token cookie does not yet exist before the first login.
  // These endpoints are their OWN anti-CSRF mechanism:
  //   - /auth/login: protected by password
  //   - /auth/register: protected by email uniqueness
  //   - /auth/firebase/login: protected by Firebase ID token signed by Google
  //   - /auth/forgot-password / reset-password: protected by OTP/token
  '/api/auth/login',
  '/api/auth/register',
  '/api/auth/firebase/login',
  '/api/auth/firebase/complete-profile',
  '/api/auth/forgot-password',
  '/api/auth/reset-password',
  '/api/auth/logout',
];

/**
 * Middleware: attach a CSRF token cookie to every response, and validate
 * the header on state-changing requests.
 */
const csrfProtection = (req, res, next) => {
  // Generate (or reuse) the CSRF token for this request
  const existingToken = req.cookies?.['csrf-token'];
  const csrfToken = existingToken || crypto.randomBytes(32).toString('hex');

  const isSecure = process.env.NODE_ENV === 'production';

  // Always (re-)set the cookie so the client has a fresh value
  res.cookie('csrf-token', csrfToken, {
    httpOnly: false,   // must be readable by JS
    secure: isSecure,
    sameSite: 'strict',
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  });

  // Safe methods do not need validation
  if (!UNSAFE_METHODS.has(req.method)) {
    return next();
  }

  // Exempt paths (e.g. incoming webhooks, session bootstrap endpoints).
  // Use req.originalUrl (the full path) so this works regardless of where
  // the middleware is mounted. req.path strips the mount prefix.
  const fullPath = req.originalUrl.split('?')[0]; // strip query string
  if (CSRF_EXEMPT_PATHS.some(p => fullPath.startsWith(p))) {
    return next();
  }

  // Explicit per-route exemption
  if (res.locals.skipCsrf) {
    return next();
  }

  // Validate the header against the cookie
  const headerToken = req.headers['x-csrf-token'];
  if (!headerToken || headerToken !== csrfToken) {
    return res.status(403).json({
      success: false,
      message: 'CSRF validation failed. Please refresh the page and try again.',
      code: 'CSRF_INVALID'
    });
  }

  next();
};

/**
 * Express middleware that issues (or refreshes) a CSRF token without
 * enforcing validation – useful for GET endpoints that want to pre-seed
 * the cookie before any state-changing call.
 */
const csrfIssue = (req, res, next) => {
  const isSecure = process.env.NODE_ENV === 'production';
  const token = crypto.randomBytes(32).toString('hex');
  res.cookie('csrf-token', token, {
    httpOnly: false,
    secure: isSecure,
    sameSite: 'strict',
    maxAge: 24 * 60 * 60 * 1000
  });
  res.locals.csrfToken = token;
  next();
};

module.exports = { csrfProtection, csrfIssue };
