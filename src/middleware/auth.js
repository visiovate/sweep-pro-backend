const jwt = require('jsonwebtoken');
const { getPrismaClient } = require('../utils/database');

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

const authenticateToken = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');

    if (!token) {
      throw new Error('Token missing');
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');

    if (!decoded?.userId && !decoded?.id) {
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
    console.error('Authentication error:', error?.message || error);
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

