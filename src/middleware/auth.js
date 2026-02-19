const jwt = require('jsonwebtoken');
const { getPrismaClient } = require('../utils/database');
const { getFirebaseAuth } = require('../config/firebase');
const { getJwtSecret } = require('../config/validateEnv');

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

const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.header('Authorization');
    console.log('🔐 Auth Debug - Authorization header:', authHeader ? `Bearer ${authHeader.substring(0, 20)}...` : 'MISSING');
    
    const token = authHeader?.replace('Bearer ', '');

    if (!token) {
      console.log('🔐 Auth Debug - Token not found in Authorization header');
      throw new Error('Token missing');
    }

    console.log('🔐 Auth Debug - Token found, length:', token.length);
    let decoded = null;

    try {
      console.log('🔐 Auth Debug - JWT_SECRET configured:', !!process.env.JWT_SECRET);
      // SECURITY: Use centralized JWT secret getter - NEVER fallback to default
      decoded = jwt.verify(token, getJwtSecret());
      console.log('🔐 Auth Debug - JWT verified successfully, userId:', decoded?.userId || decoded?.id);
    } catch (jwtError) {
      console.log('🔐 Auth Debug - JWT verification failed:', jwtError.message);
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
        console.log('🔐 Auth Debug - Firebase verification also failed:', firebaseError.message);
        throw firebaseError;
      }
    }

    if (!decoded?.userId && !decoded?.id) {
      console.log('🔐 Auth Debug - Token payload invalid, decoded:', decoded);
      throw new Error('Invalid token payload');
    }

    // If request already has user attached (e.g. previous middleware), skip
    if (req.user) {
      return next();
    }

    const sanitizedClaims = buildAuthSuccessResponse(decoded);

    // Optionally refresh user snapshot when token lacks extended info or when enforceFreshUser flag is set
    if (process.env.AUTH_FORCE_USER_REFRESH === 'true' || !sanitizedClaims.role) {
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

      if (!freshUser) {
        throw new Error('User not found');
      }

      req.user = buildAuthSuccessResponse(decoded, freshUser);
    } else {
      req.user = sanitizedClaims;
    }

    next();
  } catch (error) {
    console.error('❌ Authentication error:', error?.message || error);
    console.error('❌ Error stack:', error?.stack);
    res.status(401).json({ error: 'Please authenticate.' });
  }
};


const auth = authenticateToken;


const authorizeAdmin = async (req, res, next) => {
  try {
    console.log('User role check:', req.user?.role, 'User ID:', req.user?.id);
    if (req.user?.role !== 'ADMIN') {
      console.log('Access denied - user role is:', req.user?.role);
      throw new Error();
    }
    console.log('Admin access granted');
    next();
  } catch (error) {
    res.status(403).json({ error: 'Access denied. Admin privileges required.' });
  }
};

const authorizeMaid = async (req, res, next) => {
  try {
    if (req.user?.role !== 'MAID') {
      throw new Error();
    }
    next();
  } catch (error) {
    res.status(403).json({ error: 'Access denied. Maid privileges required.' });
  }
};

const checkRole = (roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Please authenticate.' });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Access denied.' });
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

