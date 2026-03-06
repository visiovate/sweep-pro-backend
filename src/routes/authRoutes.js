const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { registerValidation, loginValidation } = require('../middleware/validation');
const { authenticateToken } = require('../middleware/auth');
const notificationService = require('../services/notificationService');
const emailService = require('../services/notification/EmailService');
const { initializePrisma } = require('../utils/database');
// SECURITY: Import JWT secret getter
const { getJwtSecret } = require('../config/validateEnv');
const { blacklistToken } = require('../utils/tokenBlacklist');

router.post('/register', registerValidation, async (req, res) => {
  try {
    const prisma = await initializePrisma();
    const { name, email, phone, role, password, timeSlot, confirmPassword, address, serviceArea, pincode } = req.body;

    // Check if user already exists by email
    const existingUserByEmail = await prisma.user.findUnique({
      where: { email }
    });

    if (existingUserByEmail) {
      return res.status(400).json({
        success: false,
        message: 'User with this email already exists',
        field: 'email'
      });
    }

    // Check if phone number already exists
    const existingUserByPhone = await prisma.user.findUnique({
      where: { phone }
    });

    if (existingUserByPhone) {
      return res.status(400).json({
        success: false,
        message: 'User with this phone number already exists',
        field: 'phone'
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    const userData = {
      name,
      email,
      phone,
      role,
      timeSlot,
      password: hashedPassword,
      address,
      profile_completed: true,
      status: 'ACTIVE'
    };

    if (serviceArea) {
      userData.locality = serviceArea;
    }

    if (pincode) {
      userData.pincode = pincode;
    }

    let createdUser;

    try {
      createdUser = await prisma.user.create({
        data: userData
      });

      if (role === 'CUSTOMER') {
        await prisma.customerProfile.create({
          data: {
            userId: createdUser.id,
            preferences: {},
            emergencyContact: null,
            specialInstructions: null
          }
        });
      } else if (role === 'MAID') {
        await prisma.maidProfile.create({
          data: {
            userId: createdUser.id,
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
    } catch (creationError) {
      if (createdUser) {
        await prisma.user.delete({ where: { id: createdUser.id } }).catch(() => undefined);
      }
      throw creationError;
    }

    // Generate JWT token
    // SECURITY: Use centralized JWT secret getter - NEVER use fallback
    const token = jwt.sign(
      {
        userId: createdUser.id,
        id: createdUser.id,
        role: createdUser.role
      },
      getJwtSecret(),
      { expiresIn: '24h' }
    );

    // Send notification about new user registration
    try {
      await notificationService.notifyUserRegistration(createdUser);
    } catch (notificationError) {
      console.error('Failed to send registration notification:', notificationError);
      // Don't fail the registration if notification fails
    }

    // Prepare response without sensitive data
    const userResponse = {
      id: createdUser.id,
      name: createdUser.name,
      email: createdUser.email,
      firebase_uid: createdUser.firebase_uid,
      phone: createdUser.phone,
      apartment_id: createdUser.apartment_id,
      profile_completed: createdUser.profile_completed,
      timeSlot: createdUser.timeSlot,
      address: createdUser.address,
      role: createdUser.role,
      status: createdUser.status,
      locality: createdUser.locality,
      pincode: createdUser.pincode,
      createdAt: createdUser.createdAt
    };

    // M6: Set HttpOnly cookie so the token is not accessible via JS on the client
    // CROSS-ORIGIN FIX: In production, frontend (Vercel) and backend (Render) are on different
    // domains. SameSite='strict' blocks cookies on cross-site requests entirely, causing all
    // authenticated API calls to fail with 401. SameSite='none' + Secure=true is required for
    // cross-origin cookie auth to work.
    const isSecureCookie = process.env.NODE_ENV === 'production';
    res.cookie('authToken', token, {
      httpOnly: true,
      secure: isSecureCookie,
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      maxAge: 24 * 60 * 60 * 1000 // default 24h
    });

    res.status(201).json({
      success: true,
      message: `${role.charAt(0) + role.slice(1).toLowerCase()} registered successfully`,
      data: {
        user: userResponse,
        // CROSS-ORIGIN FIX: Also return token in body so the frontend can
        // store it in localStorage for Authorization-header-based auth.
        // This fixes auth for cross-origin deployments (Vercel + Render)
        // where SameSite cookie restrictions prevent the cookie being sent.
        token: token
      }
    });

  } catch (error) {
    console.error('Registration error:', error);

    // Handle Prisma-specific errors
    if (error.code === 'P2002') {
      const target = error.meta?.target;
      if (target?.includes('email')) {
        return res.status(400).json({
          success: false,
          message: 'Email address is already registered',
          field: 'email'
        });
      } else if (target?.includes('phone')) {
        return res.status(400).json({
          success: false,
          message: 'Phone number is already registered',
          field: 'phone'
        });
      }
    }

    res.status(500).json({
      success: false,
      message: 'Registration failed. Please try again.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Forgot password - send reset link
router.post('/forgot-password', async (req, res) => {
  try {
    const prisma = await initializePrisma();
    const email = String(req.body?.email || '').trim().toLowerCase();

    // Always return success to avoid account enumeration
    const genericResponse = {
      success: true,
      message: 'If an account exists for that email, a reset link has been sent.'
    };

    if (!email) {
      console.log('[forgot-password] Missing email in request');
      return res.json(genericResponse);
    }

    const user = await prisma.user.findUnique({ where: { email } });

    // If user doesn't exist or doesn't have a password (OAuth user), still return generic success
    if (!user || !user.password) {
      console.log(
        `[forgot-password] No eligible user for email=${email} found=${Boolean(user)} hasPassword=${Boolean(user?.password)}`
      );
      return res.json(genericResponse);
    }

    // Invalidate existing unused tokens for this user
    await prisma.passwordResetToken.updateMany({
      where: {
        userId: user.id,
        usedAt: null,
        expiresAt: { gt: new Date() }
      },
      data: {
        usedAt: new Date()
      }
    });

    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt
      }
    });

    const resetUrlBase = process.env.FRONTEND_URL || 'http://localhost:5173';
    const resetLink = `${resetUrlBase.replace(/\/+$/, '')}/reset-password?token=${encodeURIComponent(rawToken)}`;

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #1800ad 0%, #1f2fd1 100%); padding: 24px; border-radius: 10px 10px 0 0; text-align: center;">
          <h1 style="color: white; margin: 0;">Reset your password</h1>
        </div>
        <div style="background: #f9fafb; padding: 24px; border-radius: 0 0 10px 10px;">
          <p style="font-size: 16px; color: #374151;">Hi ${user.name || 'there'},</p>
          <p style="font-size: 16px; color: #374151;">We received a request to reset your Sweepro password.</p>
          <div style="text-align: center; margin: 24px 0;">
            <a href="${resetLink}" style="display: inline-block; padding: 14px 22px; background: #1800ad; color: white; text-decoration: none; border-radius: 8px; font-weight: bold;">
              Reset Password
            </a>
          </div>
          <p style="font-size: 14px; color: #6b7280;">This link will expire in 1 hour. If you didn’t request this, you can ignore this email.</p>
        </div>
      </div>
    `;

    emailService
      .sendEmail({
        to: user.email,
        subject: 'Reset your Sweepro password',
        html
      })
      .then((emailResult) => {
        if (emailResult?.success) {
          console.log(
            `[forgot-password] Reset email sent for userId=${user.id} email=${user.email} provider=${emailResult.provider || 'unknown'} messageId=${emailResult.messageId || 'n/a'}`
          );
        } else {
          console.error(
            `[forgot-password] Reset email FAILED for userId=${user.id} email=${user.email} provider=${emailResult?.provider || 'unknown'} error=${emailResult?.error || emailResult?.reason || 'unknown'}`
          );
        }
      })
      .catch((err) => {
        console.error(
          `[forgot-password] Reset email FAILED (exception) for userId=${user.id} email=${user.email} error=${err?.message || err}`
        );
      });

    return res.json(genericResponse);
  } catch (error) {
    console.error('Forgot password error:', error);
    // Still avoid revealing anything
    return res.json({
      success: true,
      message: 'If an account exists for that email, a reset link has been sent.'
    });
  }
});

// Reset password - verify token and set new password
router.post('/reset-password', async (req, res) => {
  try {
    const prisma = await initializePrisma();
    const token = String(req.body?.token || '').trim();
    const newPassword = String(req.body?.password || '');
    const confirmPassword = String(req.body?.confirmPassword || '');

    if (!token) {
      return res.status(400).json({ success: false, message: 'Reset token is required' });
    }

    if (!newPassword || newPassword.length < 8 || newPassword.length > 128) {
      return res.status(400).json({ success: false, message: 'Password must be between 8 and 128 characters long' });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({ success: false, message: 'Password confirmation does not match password' });
    }

    // Keep same complexity policy used in registration
    const strongPasswordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&].*$/;
    if (!strongPasswordRegex.test(newPassword)) {
      return res.status(400).json({
        success: false,
        message: 'Password must contain at least one lowercase letter, one uppercase letter, one digit, and one special character'
      });
    }

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    const resetRecord = await prisma.passwordResetToken.findUnique({
      where: { tokenHash },
      include: { user: true }
    });

    if (!resetRecord || resetRecord.usedAt || resetRecord.expiresAt <= new Date()) {
      return res.status(400).json({ success: false, message: 'Invalid or expired reset token' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 12);

    await prisma.$transaction([
      prisma.user.update({
        where: { id: resetRecord.userId },
        data: { password: hashedPassword }
      }),
      prisma.passwordResetToken.update({
        where: { id: resetRecord.id },
        data: { usedAt: new Date() }
      })
    ]);

    res.json({ success: true, message: 'Password reset successful. Please log in with your new password.' });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ success: false, message: 'Failed to reset password. Please try again.' });
  }
});

// Login route
router.post('/login', loginValidation, async (req, res) => {
  try {
    const prisma = await initializePrisma();
    const { email, password, rememberMe } = req.body;

    // Find user with profiles
    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        customerProfile: true,
        maidProfile: true,
        adminProfile: true
      }
    });

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password',
        field: 'credentials'
      });
    }

    // Check if user account is active
    if (user.status !== 'ACTIVE') {
      return res.status(403).json({
        success: false,
        message: `Account is ${user.status.toLowerCase()}. Please contact support.`,
        field: 'status'
      });
    }

    // Verify password
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password',
        field: 'credentials'
      });
    }

    // Generate JWT token
    // SECURITY: Use centralized secret getter – NEVER fall back to a hardcoded default
    const token = jwt.sign(
      {
        userId: user.id,
        id: user.id,
        role: user.role
      },
      getJwtSecret(),
      { expiresIn: rememberMe ? '30d' : '24h' }
    );

    // Prepare user response without password
    const userResponse = {
      id: user.id,
      name: user.name,
      email: user.email,
      firebase_uid: user.firebase_uid,
      phone: user.phone,
      address: user.address,
      apartment_id: user.apartment_id,
      profile_completed: user.profile_completed,
      role: user.role,
      timeSlot: user.timeSlot,
      status: user.status,
      createdAt: user.createdAt,
      profiles: {
        customer: user.customerProfile,
        maid: user.maidProfile,
        admin: user.adminProfile
      }
    };

    // M6: Set HttpOnly cookie so the token is not accessible via JS on the client
    // CROSS-ORIGIN FIX: SameSite='none' required for cross-origin cookie auth (Vercel + Render)
    const isSecureCookie = process.env.NODE_ENV === 'production';
    res.cookie('authToken', token, {
      httpOnly: true,
      secure: isSecureCookie,
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      maxAge: rememberMe ? 30 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000
    });

    res.json({
      success: true,
      message: 'Login successful',
      data: {
        user: userResponse,
        // CROSS-ORIGIN FIX: Also return token in body so the frontend can
        // store it in localStorage for Authorization-header-based auth.
        // This fixes auth for cross-origin deployments (Vercel + Render)
        // where SameSite cookie restrictions prevent the cookie being sent.
        token: token
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Login failed. Please try again.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Get current user information
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const prisma = await initializePrisma();
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
        message: 'User not found'
      });
    }

    // Prepare user response without password
    const userResponse = {
      id: user.id,
      name: user.name,
      email: user.email,
      firebase_uid: user.firebase_uid,
      phone: user.phone,
      address: user.address,
      apartment_id: user.apartment_id,
      profile_completed: user.profile_completed,
      role: user.role,
      timeSlot: user.timeSlot,
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
      message: 'User information retrieved successfully',
      data: {
        user: userResponse
      }
    });

  } catch (error) {
    console.error('Get user info error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve user information',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Get all available apartments
router.get('/apartments', async (req, res) => {
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
      message: 'Apartments retrieved successfully',
      data: {
        apartments
      }
    });
  } catch (error) {
    console.error('Get apartments error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve apartments',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Logout endpoint – clears the HttpOnly auth cookie (M6)
// C6 FIX: blacklistToken() is now called so that even if the token was
// captured (XSS, network sniff, or mobile app) it cannot be reused after logout.
router.post('/logout', async (req, res) => {
  try {
    // Extract token from cookie or Authorization header
    const token = req.cookies?.authToken ||
      (req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : null);

    if (token) {
      // Compute remaining token lifetime so the blacklist entry auto-expires
      let ttlSeconds = 24 * 60 * 60; // default 24h
      try {
        const jwt = require('jsonwebtoken');
        // We use jwt.decode rather than verify because we want to blacklist
        // the token even if it's already expired (so it stays dead).
        const decoded = jwt.decode(token);
        if (decoded?.exp) {
          ttlSeconds = Math.max(1, decoded.exp - Math.floor(Date.now() / 1000));
        }
      } catch (_) { /* keep default TTL */ }

      await blacklistToken(token, ttlSeconds);
    }
  } catch (blacklistError) {
    // Log but never let blacklist failure break logout (cookie still cleared)
    console.error('[logout] Failed to blacklist token:', blacklistError.message);
  }

  // Clear the HttpOnly auth cookie regardless of blacklist outcome
  // CROSS-ORIGIN FIX: Must use same sameSite config as when cookie was set
  res.clearCookie('authToken', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax'
  });
  res.json({
    success: true,
    message: 'Logout successful'
  });
});

// Create test admin user (for development/test only - NOT production)
// SECURITY: Explicitly check that NODE_ENV is NOT production
if (process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== undefined) {
  router.post('/create-test-admin', async (req, res) => {
    try {
      // Issue 3 FIX: bare `prisma` was never declared in this file's scope,
      // causing a ReferenceError crash whenever this route was hit in dev.
      // Use initializePrisma() consistently with all other routes in this file.
      const prisma = await initializePrisma();

      // Check if test admin already exists
      const existingAdmin = await prisma.user.findUnique({
        where: { email: 'admin@test.com' }
      });

      if (existingAdmin) {
        return res.json({
          success: true,
          message: 'Test admin already exists',
          data: {
            email: 'admin@test.com',
            password: 'Admin123!',
            role: 'ADMIN'
          }
        });
      }

      // Create test admin user
      const hashedPassword = await bcrypt.hash('Admin123!', 12);
      const admin = await prisma.user.create({
        data: {
          name: 'Test Admin',
          email: 'admin@test.com',
          phone: '9999999999',
          role: 'ADMIN',
          password: hashedPassword,
          address: 'Admin Office, Test City',
          status: 'ACTIVE'
        }
      });

      // Create admin profile
      await prisma.adminProfile.create({
        data: {
          userId: admin.id,
          department: 'IT',
          permissions: ['all'],
          accessLevel: 'SUPER_ADMIN'
        }
      });

      res.json({
        success: true,
        message: 'Test admin created successfully',
        data: {
          email: 'admin@test.com',
          password: 'Admin123!',
          role: 'ADMIN'
        }
      });
    } catch (error) {
      console.error('Create test admin error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to create test admin'
      });
    }
  });
}

module.exports = router;
