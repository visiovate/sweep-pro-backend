const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { verifyFirebaseToken, requireFirebaseAuth, requireProfileCompletion } = require('../middleware/firebaseAuth');
const { initializePrisma } = require('../utils/database');
const { getFirebaseAuth } = require('../config/firebase');
const { getJwtSecret } = require('../config/validateEnv');
const notificationService = require('../services/notificationService');

/**
 * POST /auth/firebase/login
 * Google OAuth login - Creates user if not exists
 * Body: { idToken: string }
 */
router.post('/firebase/login', async (req, res) => {
  try {
    const prisma = await initializePrisma();
    const { idToken } = req.body;

    if (!idToken) {
      return res.status(400).json({
        success: false,
        error: 'Firebase ID token is required'
      });
    }

    // Verify Firebase ID token
    const firebaseAuth = getFirebaseAuth();
    let decodedToken;

    try {
      decodedToken = await firebaseAuth.verifyIdToken(idToken);
    } catch (error) {
      console.error('Firebase token verification failed:', error.message);
      return res.status(401).json({
        success: false,
        error: 'Invalid Firebase token. Please sign in again.'
      });
    }

    // Check if user exists in database
    let user = await prisma.user.findFirst({
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

    // If user doesn't exist, create one
    if (!user) {
      // Extract name from Firebase token
      const name = decodedToken.name || decodedToken.display_name || decodedToken.email?.split('@')[0] || 'User';

      user = await prisma.user.create({
        data: {
          firebase_uid: decodedToken.uid,
          email: decodedToken.email,
          name: name,
          password: null, // No password for OAuth users
          phone: null,
          role: null, // Will be set during profile completion
          apartment_id: null,
          profile_completed: false,
          status: 'ACTIVE'
        },
        include: {
          customerProfile: true,
          maidProfile: true,
          adminProfile: true
        }
      });

      // Send notification about new user registration
      try {
        await notificationService.notifyUserRegistration(user);
      } catch (notificationError) {
        console.error('Failed to send registration notification:', notificationError);
      }
    }

    // Issue a standard app JWT so the Firebase user can call all protected
    // endpoints (bookings, subscriptions, etc.) which use the standard
    // `authenticateToken` middleware. Without this, Firebase users could only
    // call /auth/firebase/* routes and would get 401/500 on everything else.
    const appJwt = jwt.sign(
      {
        userId: user.id,
        id: user.id,
        role: user.role
      },
      getJwtSecret(),
      { expiresIn: '24h' }
    );

    // M6: Set as HttpOnly cookie (same as email/password login)
    // CROSS-ORIGIN FIX: SameSite='none' required for cross-origin cookie auth (Vercel + Render)
    const isSecure = process.env.NODE_ENV === 'production';
    res.cookie('authToken', appJwt, {
      httpOnly: true,
      secure: isSecure,
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      maxAge: 24 * 60 * 60 * 1000 // 24 hours
    });

    // Prepare user response
    const userResponse = {
      id: user.id,
      firebase_uid: user.firebase_uid,
      email: user.email,
      name: user.name,
      phone: user.phone,
      role: user.role,
      apartment_id: user.apartment_id,
      profile_completed: user.profile_completed,
      status: user.status,
      createdAt: user.createdAt,
      profiles: {
        customer: user.customerProfile,
        maid: user.maidProfile,
        admin: user.adminProfile
      }
    };

    res.json({
      success: true,
      message: 'Login successful',
      data: {
        user: userResponse,
        // CROSS-ORIGIN FIX: Return app JWT (not Firebase ID token) so the
        // frontend can use Authorization-header-based auth in cross-origin deployments.
        token: appJwt
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      error: 'Login failed. Please try again.',
      message: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * GET /auth/firebase/me
 * Get current user information
 * Requires: Firebase ID token in Authorization header
 */
router.get('/firebase/me', verifyFirebaseToken, async (req, res) => {
  try {
    const prisma = await initializePrisma();

    if (!req.user) {
      return res.status(404).json({
        success: false,
        error: 'User not found in database. Please complete registration.'
      });
    }

    // Fetch fresh user data
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      include: {
        customerProfile: true,
        maidProfile: true,
        adminProfile: true
      }
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Prepare user response
    const userResponse = {
      id: user.id,
      firebase_uid: user.firebase_uid,
      email: user.email,
      name: user.name,
      phone: user.phone,
      role: user.role,
      apartment_id: user.apartment_id,
      address: user.address,
      locality: user.locality,
      pincode: user.pincode,
      latitude: user.latitude,
      longitude: user.longitude,
      profile_completed: user.profile_completed,
      status: user.status,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      profiles: {
        customer: user.customerProfile,
        maid: user.maidProfile,
        admin: user.adminProfile
      }
    };

    res.json({
      success: true,
      message: 'User information retrieved successfully',
      data: {
        user: userResponse
      }
    });

  } catch (error) {
    console.error('Get user info error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve user information',
      message: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * POST /auth/firebase/complete-profile
 * Complete mandatory onboarding fields
 * Requires: Firebase ID token, profile_completed = false
 * Body: { phone: string, role: 'CUSTOMER' | 'MAID', apartment_id?: string, address?: string, pincode?: string }
 */
router.post('/firebase/complete-profile', requireFirebaseAuth, async (req, res) => {
  try {
    const prisma = await initializePrisma();
    const { phone, apartment_id, role, address, pincode } = req.body;

    // Validate that user exists and profile is not already completed
    if (!req.user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    if (req.user.profile_completed) {
      return res.status(400).json({
        success: false,
        error: 'Profile is already completed'
      });
    }

    // Validate input
    const errors = [];

    if (!phone) {
      errors.push({ field: 'phone', message: 'Phone number is required' });
    } else if (!/^[6-9]\d{9}$/.test(phone)) {
      errors.push({ field: 'phone', message: 'Invalid phone number. Must be 10 digits starting with 6-9' });
    }

    if (!role) {
      errors.push({ field: 'role', message: 'Account type is required' });
    } else if (!['CUSTOMER', 'MAID'].includes(role)) {
      errors.push({ field: 'role', message: 'Invalid role. Must be CUSTOMER or MAID' });
    }

    if (role === 'CUSTOMER') {
      if (!apartment_id) {
        errors.push({ field: 'apartment_id', message: 'Service address is required' });
      }
    }

    if (role === 'MAID') {
      if (!address || String(address).trim() === '') {
        errors.push({ field: 'address', message: 'Residential address is required' });
      }

      if (!pincode || String(pincode).trim() === '') {
        errors.push({ field: 'pincode', message: 'Pincode is required' });
      } else if (!/^\d{6}$/.test(String(pincode).trim())) {
        errors.push({ field: 'pincode', message: 'Please provide a valid 6-digit pincode' });
      }
    }

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        errors
      });
    }

    // Check if phone number is already taken
    const existingUserByPhone = await prisma.user.findUnique({
      where: { phone }
    });

    if (existingUserByPhone && existingUserByPhone.id !== req.user.id) {
      return res.status(400).json({
        success: false,
        error: 'Phone number is already registered',
        errors: [{ field: 'phone', message: 'This phone number is already in use' }]
      });
    }

    const updateData = {
      phone,
      role,
      profile_completed: true,
    };

    if (role === 'CUSTOMER') {
      updateData.apartment_id = apartment_id;
    }

    if (role === 'MAID') {
      updateData.address = address;
      updateData.pincode = String(pincode).trim();
      updateData.apartment_id = null;
    }

    // Update user with profile information
    const updatedUser = await prisma.user.update({
      where: { id: req.user.id },
      data: updateData,
      include: {
        customerProfile: true,
        maidProfile: true,
        adminProfile: true
      }
    });

    // Create role-specific profile if needed
    if (role === 'CUSTOMER' && !updatedUser.customerProfile) {
      await prisma.customerProfile.create({
        data: {
          userId: updatedUser.id,
          preferences: {},
          emergencyContact: null,
          specialInstructions: null
        }
      });
    } else if (role === 'MAID' && !updatedUser.maidProfile) {
      await prisma.maidProfile.create({
        data: {
          userId: updatedUser.id,
          skills: [],
          languages: ['English'],
          availability: {
            monday: { start: '09:00', end: '18:00', available: true },
            tuesday: { start: '09:00', end: '18:00', available: true },
            wednesday: { start: '09:00', end: '18:00', available: true },
            thursday: { start: '09:00', end: '18:00', available: true },
            friday: { start: '09:00', end: '18:00', available: true },
            saturday: { start: '09:00', end: '16:00', available: true },
            sunday: { start: '10:00', end: '16:00', available: false }
          },
          rating: 0,
          totalRatings: 0,
          status: 'PENDING_VERIFICATION',
          isFloatingMaid: false,
          maxDailyBookings: 3,
          serviceRadius: 2.0,
          completedBookings: 0,
          cancelledBookings: 0,
          attendanceStreak: 0,
          performanceScore: 0,
          commissionRate: 0.15
        }
      });
    }

    // Fetch updated user with profiles
    const finalUser = await prisma.user.findUnique({
      where: { id: updatedUser.id },
      include: {
        customerProfile: true,
        maidProfile: true,
        adminProfile: true
      }
    });

    // M6: Re-issue JWT cookie because the initial Firebase OAuth login
    // set the role to `null`. Now that the profile is complete and the
    // role is determined, we must issue a new token with the correct role
    // to prevent 403 Forbidden errors when fetching dashboard data.
    const appJwt = jwt.sign(
      {
        userId: finalUser.id,
        id: finalUser.id,
        role: finalUser.role
      },
      getJwtSecret(),
      { expiresIn: '24h' }
    );

    // CROSS-ORIGIN FIX: SameSite='none' required for cross-origin cookie auth (Vercel + Render)
    const isSecureCookie = process.env.NODE_ENV === 'production';
    res.cookie('authToken', appJwt, {
      httpOnly: true,
      secure: isSecureCookie,
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      maxAge: 24 * 60 * 60 * 1000 // 24 hours
    });

    // Prepare response
    const userResponse = {
      id: finalUser.id,
      firebase_uid: finalUser.firebase_uid,
      email: finalUser.email,
      name: finalUser.name,
      phone: finalUser.phone,
      role: finalUser.role,
      apartment_id: finalUser.apartment_id,
      address: finalUser.address,
      locality: finalUser.locality,
      pincode: finalUser.pincode,
      profile_completed: finalUser.profile_completed,
      status: finalUser.status,
      createdAt: finalUser.createdAt,
      updatedAt: finalUser.updatedAt,
      profiles: {
        customer: finalUser.customerProfile,
        maid: finalUser.maidProfile,
        admin: finalUser.adminProfile
      }
    };

    res.json({
      success: true,
      message: 'Profile completed successfully',
      data: {
        user: userResponse
      }
    });

  } catch (error) {
    console.error('Complete profile error:', error);

    // Handle Prisma-specific errors
    if (error.code === 'P2002') {
      const target = error.meta?.target;
      if (target?.includes('phone')) {
        return res.status(400).json({
          success: false,
          error: 'Phone number is already registered',
          errors: [{ field: 'phone', message: 'This phone number is already in use' }]
        });
      }
    }

    res.status(500).json({
      success: false,
      error: 'Failed to complete profile. Please try again.',
      message: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

router.put('/firebase/update-profile', requireFirebaseAuth, async (req, res) => {
  try {
    const prisma = await initializePrisma();
    if (!req.user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    const { address, pincode, locality, latitude, longitude } = req.body;

    const updateData = {};
    if (typeof address !== 'undefined') updateData.address = address;
    if (typeof pincode !== 'undefined') updateData.pincode = pincode;
    if (typeof locality !== 'undefined') updateData.locality = locality;
    if (typeof latitude !== 'undefined') updateData.latitude = Number(latitude);
    if (typeof longitude !== 'undefined') updateData.longitude = Number(longitude);

    const updatedUser = await prisma.user.update({
      where: { id: req.user.id },
      data: updateData,
      include: {
        customerProfile: true,
        maidProfile: true,
        adminProfile: true
      }
    });

    try {
      await notificationService.notifyUserProfileUpdate(updatedUser);
    } catch (e) {
    }

    const userResponse = {
      id: updatedUser.id,
      firebase_uid: updatedUser.firebase_uid,
      email: updatedUser.email,
      name: updatedUser.name,
      phone: updatedUser.phone,
      role: updatedUser.role,
      apartment_id: updatedUser.apartment_id,
      address: updatedUser.address,
      locality: updatedUser.locality,
      pincode: updatedUser.pincode,
      latitude: updatedUser.latitude,
      longitude: updatedUser.longitude,
      profile_completed: updatedUser.profile_completed,
      status: updatedUser.status,
      createdAt: updatedUser.createdAt,
      updatedAt: updatedUser.updatedAt,
      profiles: {
        customer: updatedUser.customerProfile,
        maid: updatedUser.maidProfile,
        admin: updatedUser.adminProfile
      }
    };

    res.json({
      success: true,
      message: 'Profile updated successfully',
      data: {
        user: userResponse
      }
    });
  } catch (error) {
    console.error('Firebase profile update error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update profile'
    });
  }
});

/**
 * GET /auth/firebase/apartments
 * Get list of available apartments for onboarding
 * Public endpoint (no auth required)
 */
router.get('/firebase/apartments', async (req, res) => {
  try {
    // Return the list of apartments (can be moved to database later)
    const apartments = [
      { id: '1', name: 'Aparna CyberLife', area: 'Nallagandla', pincode: '500019' },
      { id: '2', name: 'Aparna HillPark Avenue', area: 'Chandanagar', pincode: '500050' },
      { id: '3', name: 'Aparna Kanopy Tulip', area: 'Kompally', pincode: '500100' },
      { id: '4', name: 'Aparna Sarovar Grande', area: 'Nallagandla', pincode: '500019' },
      { id: '5', name: 'Aparna Serene Park', area: 'Kondapur', pincode: '500084' },
      { id: '6', name: 'Bollineni Bion', area: 'Kothaguda', pincode: '500084' },
      { id: '7', name: 'Brigade Citadel', area: 'Moti Nagar', pincode: '500018' },
      { id: '8', name: 'Cybercity Oriana', area: 'Moosapet', pincode: '500018' },
      { id: '9', name: 'Fortune Green Homes Sapphire', area: 'Bachupally', pincode: '500090' },
      { id: '10', name: 'Fortune Sky Villas', area: 'Kokapet', pincode: '500075' },
      { id: '11', name: 'Godrej Madison Avenue', area: 'Kokapet', pincode: '500075' },
      { id: '12', name: 'L&T Serene County', area: 'Gachibowli', pincode: '500032' },
      { id: '13', name: 'Lanco Hills Apartments', area: 'Manikonda', pincode: '500089' },
      { id: '14', name: 'Lodha Bellezza', area: 'Kukatpally', pincode: '500072' },
      { id: '15', name: 'Malaysian Township', area: 'Kukatpally', pincode: '500072' },
      { id: '16', name: 'My Home Abhra', area: 'Madhapur', pincode: '500081' },
      { id: '17', name: 'My Home Apas', area: 'Kokapet', pincode: '500075' },
      { id: '18', name: 'My Home Avali', area: 'Gopanpally', pincode: '500075' },
      { id: '19', name: 'My Home Bhooja', area: 'Hitech City', pincode: '500081' },
      { id: '20', name: 'My Home Grava', area: 'Kokapet', pincode: '500075' },
      { id: '21', name: 'My Home Krishe', area: 'Gachibowli', pincode: '500032' },
      { id: '22', name: 'My Home Mangala', area: 'Kondapur', pincode: '500084' },
      { id: '23', name: 'My Home Nishada', area: 'Kokapet', pincode: '500075' },
      { id: '24', name: 'My Home Raka', area: 'Madinaguda', pincode: '500049' },
      { id: '25', name: 'My Home Sayuk', area: 'Tellapur', pincode: '500019' },
      { id: '26', name: 'My Home Tridasa', area: 'Tellapur', pincode: '500019' },
      { id: '27', name: 'My Home Vipina', area: 'Tellapur', pincode: '500019' },
      { id: '28', name: 'Prestige Beverly Hills', area: 'Kokapet', pincode: '500075' },
      { id: '29', name: 'Prestige High Fields', area: 'Gachibowli', pincode: '500032' },
      { id: '30', name: 'Prestige Ivy League', area: 'Hitech City', pincode: '500081' },
      { id: '31', name: 'Prestige Rainbow Waters', area: 'Gachibowli', pincode: '500032' },
      { id: '32', name: 'Rainbow Vistas Rock Garden', area: 'Moosapet', pincode: '500018' },
      { id: '33', name: 'Rajapushpa Atria', area: 'Kokapet', pincode: '500075' },
      { id: '34', name: 'Rajapushpa Provincia', area: 'Narsingi', pincode: '500075' },
      { id: '35', name: 'Ramky One Astra', area: 'Kokapet', pincode: '500075' },
      { id: '36', name: 'Ramky One Harmony', area: 'Pragathi Nagar', pincode: '500090' },
      { id: '37', name: 'SMR Vinay Iconia', area: 'Kondapur', pincode: '500084' },
      { id: '38', name: 'Vasavi Atlantis', area: 'Narsingi', pincode: '500075' },
      { id: '39', name: 'Vasavi Skyla', area: 'Hitech City', pincode: '500081' }
    ];

    res.json({
      success: true,
      data: {
        apartments
      }
    });

  } catch (error) {
    console.error('Get apartments error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve apartments',
      message: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

module.exports = router;

