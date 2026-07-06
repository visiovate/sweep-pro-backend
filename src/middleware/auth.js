const jwt = require('jsonwebtoken');
const { getPrismaClient } = require('../utils/database');
const { getFirebaseAuth } = require('../config/firebase');
const { isTokenBlacklisted } = require('../utils/tokenBlacklist');
const { getJwtSecret } = require('../config/validateEnv');
const logger = require('../utils/logger');

const buildAuthSuccessResponse = (decodedPayload, userRecord = null) => {
  const baseClaims = {
    id: decodedPayload.userId || decodedPayload.id,
    role: decodedPayload.role,
    name: decodedPayload.name,
    email: decodedPayload.email,
    status: decodedPayload.status,
    customerProfileId: decodedPayload.customerProfileId,
    maidProfileId: decodedPayload.maidProfileId,
    adminProfileId: decodedPayload.adminProfileId
  };

  if (!userRecord) {
    return baseClaims;
  }

  return {
    ...baseClaims,
    role: userRecord.role || baseClaims.role,
    name: userRecord.name,
    email: userRecord.email,
    phone: userRecord.phone,
    status: userRecord.status,
    customerProfileId: userRecord?.customerProfile?.id,
    maidProfileId: userRecord?.maidProfile?.id,
    adminProfileId: userRecord?.adminProfile?.id
  };
};

const buildFirebaseAuthSuccessResponse = (firebaseDecodedToken, userRecord) => {
  return {
    id: userRecord.id,
    userId: userRecord.id,
    role: userRecord.role,
    name: userRecord.name,
    email: userRecord.email || firebaseDecodedToken.email,
    status: userRecord.status,
    phone: userRecord.phone,
    firebase_uid: userRecord.firebase_uid || firebaseDecodedToken.uid,
    apartment_id: userRecord.apartment_id,
    profile_completed: userRecord.profile_completed,
    customerProfileId: userRecord?.customerProfile?.id,
    maidProfileId: userRecord?.maidProfile?.id,
    adminProfileId: userRecord?.adminProfile?.id
  };
};

/**
 * Extract the bearer token from the Authorization header OR the authToken
 * HttpOnly cookie (cookie-based auth, M6 hardening).
 */
const extractToken = (req) => {
  // M6 Hardening: Prioritize the HttpOnly cookie if it exists.
  // This prevents issues where a stale token stuck in the client's
  // localStorage is sent via Authorization header and causes a 401,
  // even after a successful fresh login sets a new cookie.
  if (req.cookies?.authToken) {
    return req.cookies.authToken;
  }

  // Fallback to Authorization header if no cookie is present
  const authHeader = req.header('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }

  return null;
};

const authenticateToken = async (req, res, next) => {
  // Attach a request ID for traceable structured logs
  const requestId = req.headers['x-request-id'] || req.id || undefined;

  try {
    const token = extractToken(req);

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Please authenticate.',
        code: 'TOKEN_MISSING'
      });
    }

    let decoded = null;

    try {
      // SECURITY: Use centralized JWT secret getter – NEVER fall back to a default
      decoded = jwt.verify(token, getJwtSecret());
    } catch (jwtError) {
      // Distinguish expected expiry from a potentially tampered token
      if (jwtError.name === 'TokenExpiredError') {
        // Normal case – log at info, not as an error
        logger.info('JWT token expired', { requestId, message: jwtError.message });
      } else if (jwtError.name === 'JsonWebTokenError') {
        // Could indicate a forgery attempt – log at warn
        logger.warn('Invalid JWT token (potential security concern)', {
          requestId,
          message: jwtError.message
        });
      }

      // Not a valid JWT. Try Firebase ID token (Google sign-in sessions).
      try {
        const firebaseAuth = getFirebaseAuth();
        const firebaseDecodedToken = await firebaseAuth.verifyIdToken(token);

        const prisma = getPrismaClient();
        if (!prisma) {
          throw new Error('Database unavailable');
        }

        const userRecord = await prisma.user.findFirst({
          where: {
            OR: [
              { firebase_uid: firebaseDecodedToken.uid },
              { email: firebaseDecodedToken.email }
            ]
          },
          include: {
            customerProfile: true,
            maidProfile: true,
            adminProfile: true
          }
        });

        if (!userRecord) {
          throw new Error('User not found');
        }

        req.firebaseUser = {
          uid: firebaseDecodedToken.uid,
          email: firebaseDecodedToken.email,
          emailVerified: firebaseDecodedToken.email_verified || false,
          name: firebaseDecodedToken.name || firebaseDecodedToken.display_name || null
        };

        // If request already has user attached (e.g. previous middleware), skip
        if (req.user) {
          return next();
        }

        req.user = buildFirebaseAuthSuccessResponse(firebaseDecodedToken, userRecord);
        return next();
      } catch (firebaseError) {
        // Firebase verification also failed – the token is definitively invalid
        logger.warn('Authentication failed: both JWT and Firebase verification rejected the token', {
          requestId,
          message: firebaseError.message
        });
        return res.status(401).json({
          success: false,
          message: 'Please authenticate.',
          code: 'TOKEN_INVALID'
        });
      }
    }

    if (!decoded?.userId && !decoded?.id) {
      logger.warn('JWT payload missing user identifier', { requestId });
      return res.status(401).json({
        success: false,
        message: 'Please authenticate.',
        code: 'TOKEN_INVALID'
      });
    }

    // C6 FIX: Check token blacklist AFTER successful JWT verification.
    // This ensures that tokens from logged-out sessions are rejected even if
    // they are cryptographically valid and not yet expired.
    // Issue 1 FIX: reuse the outer `token` already extracted at line 75.
    // Previously a `const token = extractToken(req)` was needlessly re-declared
    // here, shadowing the outer variable and causing confusion.
    try {
      if (await isTokenBlacklisted(token)) {
        logger.info('Blacklisted token rejected', { requestId });
        return res.status(401).json({
          success: false,
          message: 'Please authenticate.',
          code: 'TOKEN_REVOKED'
        });
      }
    } catch (blacklistError) {
      // isTokenBlacklisted fails-closed (returns true) when Redis is down,
      // so this catch path handles unexpected/internal errors only.
      logger.warn('Token blacklist check error', { requestId, message: blacklistError.message });
      return res.status(503).json({
        success: false,
        message: 'Authentication service temporarily unavailable.',
        code: 'AUTH_UNAVAILABLE'
      });
    }

    // If request already has user attached (e.g. previous middleware), skip
    if (req.user) {
      return next();
    }

    const sanitizedClaims = buildAuthSuccessResponse(decoded);
    const prisma = getPrismaClient();
    if (!prisma) {
      throw new Error('Database unavailable');
    }

    const freshUser = await prisma.user.findUnique({
      where: { id: sanitizedClaims.id },
      include: {
        customerProfile: true,
        maidProfile: true,
        adminProfile: true
      }
    });

    if (!freshUser || freshUser.status !== 'ACTIVE') {
      logger.warn('JWT rejected for missing or inactive user', { requestId, userId: sanitizedClaims.id });
      return res.status(401).json({
        success: false,
        message: 'Please authenticate.',
        code: 'TOKEN_INVALID'
      });
    }

    // Only check email verification for users with passwords (email/password users)
    // OAuth users (no password) are already verified by Google
    if (freshUser.password && !freshUser.emailVerifiedAt) {
      return res.status(403).json({
        success: false,
        message: 'Please verify your email before continuing.',
        code: 'EMAIL_NOT_VERIFIED'
      });
    }

    if ((decoded.tokenVersion || 0) !== (freshUser.tokenVersion || 0)) {
      logger.info('JWT rejected due to token version mismatch', { requestId, userId: freshUser.id });
      return res.status(401).json({
        success: false,
        message: 'Please authenticate.',
        code: 'TOKEN_REVOKED'
      });
    }

    if (freshUser.passwordChangedAt && decoded.iat) {
      const issuedAtMs = decoded.iat * 1000;
      if (issuedAtMs < freshUser.passwordChangedAt.getTime()) {
        logger.info('JWT rejected because password changed after token issuance', { requestId, userId: freshUser.id });
        return res.status(401).json({
          success: false,
          message: 'Please authenticate.',
          code: 'TOKEN_REVOKED'
        });
      }
    }

    req.user = buildAuthSuccessResponse(decoded, freshUser);
    next();
  } catch (error) {
    // Unexpected internal error – log message only in production, full stack in dev
    logger.error('Unexpected authentication error', {
      requestId,
      message: error?.message,
      ...(process.env.NODE_ENV !== 'production' && { stack: error?.stack })
    });
    res.status(500).json({
      success: false,
      message: 'Authentication service error.',
      code: 'AUTH_ERROR'
    });
  }
};


const auth = authenticateToken;


const authorizeAdmin = (req, res, next) => {
  if (req.user?.role !== 'ADMIN') {
    return res.status(403).json({
      success: false,
      message: 'Access denied. Admin privileges required.',
      code: 'FORBIDDEN'
    });
  }
  next();
};

const authorizeMaid = (req, res, next) => {
  if (req.user?.role !== 'MAID') {
    return res.status(403).json({
      success: false,
      message: 'Access denied. Maid privileges required.',
      code: 'FORBIDDEN'
    });
  }
  next();
};

const checkRole = (roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Please authenticate.',
        code: 'UNAUTHENTICATED'
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied.',
        code: 'FORBIDDEN'
      });
    }

    next();
  };
};

module.exports = {
  auth,
  authenticateToken,
  authorizeAdmin,
  authorizeMaid,
  checkRole
};

