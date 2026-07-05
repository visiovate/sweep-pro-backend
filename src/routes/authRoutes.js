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

const otpService = require('../services/otpService');
const otpController = require('../controllers/otpController');
const { otpLimiter } = require('../middleware/rateLimiters');

const ACCESS_TOKEN_TTL = '24h';
const REMEMBER_ME_ACCESS_TOKEN_TTL = '7d';
const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_FAILED_LOGIN_ATTEMPTS = 5;
const ACCOUNT_LOCK_MS = 15 * 60 * 1000;
const DUMMY_PASSWORD_HASH = '$2a$12$CwTycUXWue0Thq9StjUM0uJ8UjMrbJvQPMQnBdVdFzRkJbbYQz9h2';

const normalizeEmail = (value) => String(value || '').trim().toLowerCase();

const hashOpaqueToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

const buildCookieOptions = (maxAge) => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
  maxAge
});

const signAccessToken = (user, expiresIn = ACCESS_TOKEN_TTL) => jwt.sign(
  {
    userId: user.id,
    id: user.id,
    role: user.role,
    tokenVersion: user.tokenVersion || 0
  },
  getJwtSecret(),
  { expiresIn }
);

const safeUserResponse = (user) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  firebase_uid: user.firebase_uid,
  phone: user.phone,
  apartment_id: user.apartment_id,
  profile_completed: user.profile_completed,
  timeSlot: user.timeSlot,
  address: user.address,
  role: user.role,
  status: user.status,
  emailVerified: Boolean(user.emailVerifiedAt),
  locality: user.locality,
  pincode: user.pincode,
  createdAt: user.createdAt,
  profiles: user.customerProfile || user.maidProfile || user.adminProfile ? {
    customer: user.customerProfile,
    maid: user.maidProfile,
    admin: user.adminProfile
  } : undefined
});

const isMissingEmailVerifiedColumnError = (error) => {
  const message = String(error?.message || '');
  return error?.code === 'P2022' || message.includes('User.emailVerifiedAt') || message.includes('emailVerifiedAt');
};

const buildDatabaseSchemaErrorResponse = (actionLabel) => ({
  success: false,
  message: `${actionLabel} is temporarily unavailable because the database schema is missing the required User.emailVerifiedAt column. Please apply the latest migration and try again.`,
  code: 'DATABASE_SCHEMA_OUT_OF_SYNC'
});

const sendVerificationEmail = async (prisma, user) => {
  const rawOtp = await otpService.generateOTP(user.id, 'EMAIL_VERIFICATION');
  await otpService.sendOTPEmail(user, rawOtp);
};

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
      status: 'PENDING_VERIFICATION'
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

    let verificationEmailSent = true;
    try {
      await sendVerificationEmail(prisma, createdUser);
    } catch (emailError) {
      verificationEmailSent = false;
      console.error('Verification email delivery failed:', emailError);
    }

    // Send notification about new user registration
    try {
      await notificationService.notifyUserRegistration(createdUser);
    } catch (notificationError) {
      console.error('Failed to send registration notification:', notificationError);
      // Don't fail the registration if notification fails
    }

    res.status(201).json({
      success: true,
      message: verificationEmailSent
        ? 'Registration successful. Please verify your email before logging in.'
        : 'Registration successful, but the verification email could not be sent. Use resend verification or contact support.',
      data: {
        user: safeUserResponse(createdUser),
        verificationEmailSent
      }
    });

  } catch (error) {
    console.error('Registration error:', error);

    if (isMissingEmailVerifiedColumnError(error)) {
      return res.status(503).json(buildDatabaseSchemaErrorResponse('Registration'));
    }

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
router.post('/verify-email', otpLimiter, otpController.verifyEmailOtp);
router.post('/resend-verification', otpLimiter, otpController.resendVerificationOtp);
router.post('/send-verification-otp', otpLimiter, otpController.sendVerificationOtp);
router.post('/verify-email-otp', otpLimiter, otpController.verifyEmailOtp);
router.post('/resend-verification-otp', otpLimiter, otpController.resendVerificationOtp);

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
      return res.json(genericResponse);
    }

    const user = await prisma.user.findUnique({ where: { email } });

    // If user doesn't exist or doesn't have a password (OAuth user), still return generic success
    if (!user || !user.password) {
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
    const otp = Math.floor(100000 + Math.random() * 900000).toString(); // 6-digit OTP
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash,
        otp,
        expiresAt
      }
    });

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #1800ad 0%, #1f2fd1 100%); padding: 24px; border-radius: 10px 10px 0 0; text-align: center;">
          <h1 style="color: white; margin: 0;">Reset your password</h1>
        </div>
        <div style="background: #f9fafb; padding: 24px; border-radius: 0 0 10px 10px;">
          <p style="font-size: 16px; color: #374151;">Hi ${user.name || 'there'},</p>
          <p style="font-size: 16px; color: #374151;">We received a request to reset your Sweepro password.</p>
          <p style="font-size: 16px; color: #374151;">Your password reset code is:</p>
          <p style="font-size: 32px; font-weight: bold; letter-spacing: 4px; color: #1800ad; text-align: center; padding: 20px; background: #f0f0f0; border-radius: 8px;">${otp}</p>
          <p style="font-size: 14px; color: #6b7280;">This code will expire in 1 hour. If you didn't request this, you can ignore this email.</p>
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
        if (!emailResult?.success) {
          console.error(
            `[forgot-password] Reset email delivery failed for userId=${user.id} provider=${emailResult?.provider || 'unknown'} error=${emailResult?.error || emailResult?.reason || 'unknown'}`
          );
        }
      })
      .catch((err) => {
        console.error(
          `[forgot-password] Reset email delivery exception for userId=${user.id} error=${err?.message || err}`
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

// Verify password reset OTP
router.post('/verify-reset-otp', async (req, res) => {
  try {
    const prisma = await initializePrisma();
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({ success: false, message: 'Email and OTP are required.' });
    }

    const normalizedEmail = normalizeEmail(email);
    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail }
    });

    if (!user) {
      return res.status(400).json({ success: false, message: 'User not found.' });
    }

    const resetRecord = await prisma.passwordResetToken.findFirst({
      where: {
        userId: user.id,
        otp: otp,
        usedAt: null,
        expiresAt: { gt: new Date() }
      },
      orderBy: { createdAt: 'desc' }
    });

    if (!resetRecord) {
      return res.status(400).json({ success: false, message: 'Invalid or expired OTP.' });
    }

    // Generate a temporary verification token for password reset
    const tempToken = crypto.randomBytes(32).toString('hex');
    const tempTokenHash = crypto.createHash('sha256').update(tempToken).digest('hex');
    const tempExpiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    // Store the temporary token in the existing record
    await prisma.passwordResetToken.update({
      where: { id: resetRecord.id },
      data: {
        tokenHash: tempTokenHash,
        expiresAt: tempExpiresAt
      }
    });

    res.json({ 
      success: true, 
      message: 'OTP verified successfully. Please set your new password.',
      token: tempToken // Send the temporary token for password reset
    });
  } catch (error) {
    console.error('OTP verification error:', error);
    res.status(500).json({ success: false, message: 'OTP verification failed. Please try again.' });
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
        data: { password: hashedPassword, passwordChangedAt: new Date(), tokenVersion: { increment: 1 }, failedLoginAttempts: 0, lockedUntil: null }
      }),
      prisma.passwordResetToken.update({
        where: { id: resetRecord.id },
        data: { usedAt: new Date() }
      })
    ]);

    res.clearCookie('authToken', buildCookieOptions(0));
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
    const email = normalizeEmail(req.body.email);
    const { password, rememberMe } = req.body;

    const genericInvalid = {
      success: false,
      message: 'Invalid email or password',
      field: 'credentials'
    };

    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        customerProfile: true,
        maidProfile: true,
        adminProfile: true
      }
    });

    if (!user || !user.password) {
      await bcrypt.compare(String(password || ''), DUMMY_PASSWORD_HASH);
      return res.status(401).json(genericInvalid);
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      return res.status(423).json({
        success: false,
        message: 'Account is temporarily locked. Please try again later or reset your password.',
        field: 'credentials'
      });
    }

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      const nextFailedAttempts = (user.failedLoginAttempts || 0) + 1;
      const lockAccount = nextFailedAttempts >= MAX_FAILED_LOGIN_ATTEMPTS;

      await prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginAttempts: lockAccount ? 0 : nextFailedAttempts,
          lockedUntil: lockAccount ? new Date(Date.now() + ACCOUNT_LOCK_MS) : null
        }
      });

      return res.status(401).json(genericInvalid);
    }

    if (!user.emailVerifiedAt) {
      return res.status(403).json({
        success: false,
        message: 'Please verify your email before logging in.',
        code: 'EMAIL_NOT_VERIFIED'
      });
    }

    if (user.status !== 'ACTIVE') {
      return res.status(403).json({
        success: false,
        message: 'Account is not active. Please contact support.',
        field: 'status'
      });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { failedLoginAttempts: 0, lockedUntil: null }
    });

    const expiresIn = rememberMe ? REMEMBER_ME_ACCESS_TOKEN_TTL : ACCESS_TOKEN_TTL;
    const token = signAccessToken(user, expiresIn);

    res.cookie('authToken', token, buildCookieOptions(rememberMe ? 7 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000));

    res.json({
      success: true,
      message: 'Login successful',
      data: { user: safeUserResponse(user) }
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
          status: 'ACTIVE',
          profile_completed: true
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

// Change password (authenticated user)
router.post('/change-password', authenticateToken, async (req, res) => {
  try {
    const prisma = await initializePrisma();
    const userId = req.user.id || req.user.userId;
    const currentPassword = String(req.body?.currentPassword || '');
    const newPassword = String(req.body?.newPassword || '');
    const confirmPassword = String(req.body?.confirmPassword || '');

    if (!currentPassword) {
      return res.status(400).json({ success: false, message: 'Current password is required' });
    }

    if (!newPassword || newPassword.length < 8 || newPassword.length > 128) {
      return res.status(400).json({ success: false, message: 'New password must be between 8 and 128 characters' });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({ success: false, message: 'New password confirmation does not match' });
    }

    const strongPasswordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&].*$/;
    if (!strongPasswordRegex.test(newPassword)) {
      return res.status(400).json({
        success: false,
        message: 'Password must contain at least one lowercase letter, one uppercase letter, one digit, and one special character'
      });
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    if (!user.password) {
      return res.status(400).json({
        success: false,
        message: 'Your account uses social login. Password change is not available.'
      });
    }

    const isCurrentValid = await bcrypt.compare(currentPassword, user.password);
    if (!isCurrentValid) {
      return res.status(401).json({ success: false, message: 'Current password is incorrect' });
    }

    const hashedNewPassword = await bcrypt.hash(newPassword, 12);

    const updateData = { password: hashedNewPassword };
    const sessionRevocationData = { passwordChangedAt: new Date(), tokenVersion: { increment: 1 }, failedLoginAttempts: 0, lockedUntil: null };
    try {
      // Try with passwordChangedAt if column exists
      await prisma.user.update({
        where: { id: userId },
        data: { ...updateData, passwordChangedAt: new Date(), tokenVersion: { increment: 1 }, failedLoginAttempts: 0, lockedUntil: null }
      });
    } catch (updateError) {
      // Fallback: update password only (passwordChangedAt column may not exist yet)
      await prisma.user.update({
        where: { id: userId },
        data: { ...updateData, ...sessionRevocationData }
      });
    }

    res.clearCookie('authToken', buildCookieOptions(0));
    res.json({ success: true, message: 'Password changed successfully. Please log in again.' });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ success: false, message: 'Failed to change password. Please try again.' });
  }
});

module.exports = router;
