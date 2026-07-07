/**
 * SECURITY: Rate Limiting Middleware
 *
 * Protects sensitive endpoints from brute force attacks and abuse:
 * - Auth endpoints: Strict rate limiting (5 attempts per 15 minutes)
 * - Payment endpoints: Moderate rate limiting (10 attempts per 15 minutes)
 * - Global: General protection (100 requests per 15 minutes)
 *
 * Each limiter is route-specific and can be combined as needed.
 */

const rateLimit = require('express-rate-limit');
const { ipKeyGenerator } = require('express-rate-limit');

/**
 * STRICT Rate Limiter for authentication endpoints
 * 5 attempts per 15 minutes per IP
 *
 * Applied to:
 * - /api/auth/login
 * - /api/auth/register
 * - /api/auth/forgot-password
 * - Firebase OAuth endpoints
 */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,              // 15 minutes
  max: 5,                                 // 5 requests per windowMs
  message: {
    success: false,
    error: 'Too many authentication attempts. Please try again after 15 minutes.',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,                  // Return rate limit info in RateLimit-* headers
  legacyHeaders: true,                    // Disable the X-RateLimit-* headers
  skip: (req) => {
    // Allow skip in test environment (only for testing)
    return process.env.NODE_ENV === 'test';
  },
  keyGenerator: ipKeyGenerator,           // IPv6-aware IP extraction
  handler: (req, res, options) => {
    res.status(429).json({
      success: false,
      error: options.message.error,
      retryAfter: options.message.retryAfter,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * MODERATE Rate Limiter for payment endpoints
 * 10 attempts per 15 minutes per IP
 *
 * Applied to:
 * - POST api.payments (all payment endpoints)
 * - POST api.subscriptions id renew
 * - POST api.bookings id confirm
 */
const paymentLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: {
    success: false,
    error: 'Too many payment attempts. Please try again after 15 minutes.'
  },
  standardHeaders: true,
  legacyHeaders: true,
  skip: (req) => {
    return process.env.NODE_ENV === 'test';
  },
  keyGenerator: ipKeyGenerator,           // IPv6-aware IP extraction
  handler: (req, res, options) => {
    res.status(429).json({
      success: false,
      error: options.message.error,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * GLOBAL Rate Limiter for all API endpoints
 * 100 requests per 15 minutes per IP
 *
 * Applied globally to all /api/* routes as a catch-all
 * This provides baseline DDoS protection
 */
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: {
    success: false,
    error: 'Too many requests. Please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: true,
  skip: (req) => {
    return process.env.NODE_ENV === 'test';
  },
  keyGenerator: ipKeyGenerator,           // IPv6-aware IP extraction
  handler: (req, res, options) => {
    res.status(429).json({
      success: false,
      error: options.message.error,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * STRICT Rate Limiter for password reset endpoints
 * 3 attempts per hour per IP (very strict)
 *
 * Applied to:
 * - /api/auth/forgot-password
 * - /api/auth/reset-password
 */
const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,               // 1 hour
  max: 3,
  message: {
    success: false,
    error: 'Too many password reset attempts. Please try again after 1 hour.'
  },
  standardHeaders: true,
  legacyHeaders: true,
  skip: (req) => {
    return process.env.NODE_ENV === 'test';
  },
  keyGenerator: ipKeyGenerator,           // IPv6-aware IP extraction
  handler: (req, res, options) => {
    res.status(429).json({
      success: false,
      error: options.message.error,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * STRICT Rate Limiter for OTP endpoints
 * 5 attempts per 15 minutes per IP
 *
 * Applied to:
 * - /api/auth/send-verification-otp
 * - /api/auth/verify-email-otp
 * - /api/auth/resend-verification-otp
 */
const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,               // 15 minutes
  max: 5,
  message: {
    success: false,
    error: 'Too many OTP requests. Please try again after 15 minutes.'
  },
  standardHeaders: true,
  legacyHeaders: true,
  skip: (req) => {
    return process.env.NODE_ENV === 'test';
  },
  keyGenerator: ipKeyGenerator,
  handler: (req, res, options) => {
    res.status(429).json({
      success: false,
      error: options.message.error,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * VERY STRICT Rate Limiter for admin authentication endpoints
 * 3 attempts per 15 minutes per IP (stricter than regular auth)
 *
 * Applied to:
 * - /api/admin/auth/login
 * - /api/admin/auth/verify-otp
 */
const adminAuthRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,               // 15 minutes
  max: 3,                                 // 3 requests per windowMs (stricter than regular auth)
  message: {
    success: false,
    error: 'Too many admin authentication attempts. Please try again after 15 minutes.',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: true,
  skip: (req) => {
    return process.env.NODE_ENV === 'test';
  },
  keyGenerator: ipKeyGenerator,
  handler: (req, res, options) => {
    res.status(429).json({
      success: false,
      error: options.message.error,
      retryAfter: options.message.retryAfter,
      timestamp: new Date().toISOString()
    });
  }
});

module.exports = {
  authLimiter,
  paymentLimiter,
  globalLimiter,
  passwordResetLimiter,
  otpLimiter,
  adminAuthRateLimiter
};
