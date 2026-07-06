const { getFirebaseAuth } = require('../config/firebase');
const { initializePrisma } = require('../utils/database');

/**
 * Middleware to verify Firebase ID token
 * Attaches user information to req.user
 */
const verifyFirebaseToken = async (req, res, next) => {
  try {
    const authHeader = req.header('Authorization');
    
    if (!authHeader) {
      return res.status(401).json({ 
        success: false,
        error: 'Authorization header missing. Please provide a Firebase ID token.' 
      });
    }

    // Extract token from "Bearer <token>"
    const token = authHeader.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({ 
        success: false,
        error: 'Token missing. Please provide a Firebase ID token.' 
      });
    }

    // Verify the Firebase ID token
    const firebaseAuth = getFirebaseAuth();
    let decodedToken;
    
    try {
      decodedToken = await firebaseAuth.verifyIdToken(token);
    } catch (error) {
      console.error('Firebase token verification error:', error.message);
      
      if (error.code === 'auth/id-token-expired') {
        return res.status(401).json({ 
          success: false,
          error: 'Token has expired. Please sign in again.' 
        });
      } else if (error.code === 'auth/id-token-revoked') {
        return res.status(401).json({ 
          success: false,
          error: 'Token has been revoked. Please sign in again.' 
        });
      }
      
      return res.status(401).json({ 
        success: false,
        error: 'Invalid or expired token. Please authenticate again.' 
      });
    }

    if (!decodedToken.email_verified) {
      return res.status(403).json({
        success: false,
        error: 'Please verify your email before continuing.'
      });
    }

    // Get user from database using Firebase UID
    const prisma = await initializePrisma();
    if (!prisma) {
      throw new Error('Database unavailable');
    }

    // Find user by Firebase UID or email
    let userRecord = null;
    
    if (decodedToken.uid) {
      userRecord = await prisma.user.findFirst({
        where: {
          OR: [
            { firebase_uid: decodedToken.uid },
            { email: decodedToken.email }
          ]
        },
        include: {
          customerProfile: true,
          maidProfile: true,
          adminProfile: true
        }
      });
    }

    // Build user object with Firebase token data and database user data
    req.firebaseUser = {
      uid: decodedToken.uid,
      email: decodedToken.email,
      emailVerified: decodedToken.email_verified || false,
      name: decodedToken.name || decodedToken.display_name || null
    };

    req.user = userRecord ? {
      id: userRecord.id,
      userId: userRecord.id,
      firebase_uid: userRecord.firebase_uid || decodedToken.uid,
      email: userRecord.email || decodedToken.email,
      name: userRecord.name,
      phone: userRecord.phone,
      role: userRecord.role,
      apartment_id: userRecord.apartment_id,
      profile_completed: userRecord.profile_completed,
      status: userRecord.status,
      customerProfileId: userRecord?.customerProfile?.id,
      maidProfileId: userRecord?.maidProfile?.id,
      adminProfileId: userRecord?.adminProfile?.id
    } : null;

    next();
  } catch (error) {
    console.error('Firebase authentication error:', error?.message || error);
    res.status(401).json({ 
      success: false,
      error: 'Authentication failed. Please authenticate again.' 
    });
  }
};

/**
 * Middleware to verify Firebase token and require existing user in database
 */
const requireFirebaseAuth = async (req, res, next) => {
  try {
    // First verify the token
    await verifyFirebaseToken(req, res, async () => {
      // Check if user exists in database
      if (!req.user) {
        return res.status(404).json({ 
          success: false,
          error: 'User not found in database. Please complete registration.' 
        });
      }

      next();
    });
  } catch (error) {
    console.error('Firebase auth requirement error:', error?.message || error);
    res.status(401).json({ 
      success: false,
      error: 'Authentication failed. Please authenticate again.' 
    });
  }
};

/**
 * Middleware to require profile completion
 * Must be used after requireFirebaseAuth
 */
const requireProfileCompletion = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ 
      success: false,
      error: 'Please authenticate.' 
    });
  }

  if (!req.user.profile_completed) {
    return res.status(403).json({ 
      success: false,
      error: 'Profile completion required. Please complete your profile to access this resource.',
      requiresProfileCompletion: true
    });
  }

  next();
};

/**
 * Role-based authorization middleware
 */
const authorizeRole = (roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ 
        success: false,
        error: 'Please authenticate.' 
      });
    }

    if (!req.user.role) {
      return res.status(403).json({ 
        success: false,
        error: 'User role not set. Please complete your profile.' 
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ 
        success: false,
        error: 'Access denied. Insufficient permissions.' 
      });
    }

    next();
  };
};

module.exports = {
  verifyFirebaseToken,
  requireFirebaseAuth,
  requireProfileCompletion,
  authorizeRole
};

