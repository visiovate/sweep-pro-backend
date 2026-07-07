const { getPrismaClient } = require('../utils/database');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { getJwtSecret } = require('../config/validateEnv');
const otpService = require('../services/otpService');
const emailService = require('../services/notification/EmailService');
const { adminAuditLogger } = require('../services/adminAuditService');

const prisma = getPrismaClient();

// Enhanced password validation for admin
const validateAdminPassword = (password) => {
  if (!password || password.length < 12) {
    return { valid: false, message: 'Password must be at least 12 characters long' };
  }
  
  if (!/[a-z]/.test(password)) {
    return { valid: false, message: 'Password must contain at least one lowercase letter' };
  }
  
  if (!/[A-Z]/.test(password)) {
    return { valid: false, message: 'Password must contain at least one uppercase letter' };
  }
  
  if (!/\d/.test(password)) {
    return { valid: false, message: 'Password must contain at least one digit' };
  }
  
  if (!/[@$!%*?&]/.test(password)) {
    return { valid: false, message: 'Password must contain at least one special character (@$!%*?&)' };
  }
  
  return { valid: true };
};

// One-time admin setup endpoint (only works if no admin exists)
const setupAdmin = async (req, res) => {
  try {
    const { email, password, name, phone } = req.body;

    // Check if admin already exists
    const existingAdmin = await prisma.user.findFirst({
      where: { role: 'ADMIN' }
    });

    if (existingAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Admin already exists. Setup can only be done once.'
      });
    }

    // Validate input
    if (!email || !password || !name) {
      return res.status(400).json({
        success: false,
        message: 'Email, password, and name are required'
      });
    }

    // Validate password complexity
    const passwordValidation = validateAdminPassword(password);
    if (!passwordValidation.valid) {
      return res.status(400).json({
        success: false,
        message: passwordValidation.message
      });
    }

    // Check if email already exists
    const existingUser = await prisma.user.findUnique({
      where: { email }
    });

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'Email already registered'
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Create admin user
    const admin = await prisma.user.create({
      data: {
        email,
        name,
        password: hashedPassword,
        phone: phone || null,
        role: 'ADMIN',
        profile_completed: true,
        status: 'ACTIVE',
        emailVerifiedAt: new Date(),
        address: 'Admin Office',
        adminProfile: {
          create: {
            permissions: {
              canManageUsers: true,
              canManageServices: true,
              canManageBookings: true,
              canManagePayments: true
            },
            department: 'Operations',
            designation: 'Admin Manager'
          }
        }
      }
    });

    // Log audit
    await adminAuditLogger.log({
      adminId: admin.id,
      action: 'admin.setup',
      resource: 'Admin',
      success: true,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });

    res.status(201).json({
      success: true,
      message: 'Admin setup successful. Please log in.',
      data: {
        email: admin.email,
        name: admin.name
      }
    });
  } catch (error) {
    console.error('Admin setup error:', error);
    res.status(500).json({
      success: false,
      message: 'Admin setup failed',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Admin login with email OTP MFA
const adminLogin = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required'
      });
    }

    // Find admin user
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      include: {
        adminProfile: true
      }
    });

    if (!user || user.role !== 'ADMIN') {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Check if account is locked
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      return res.status(423).json({
        success: false,
        message: 'Account is temporarily locked. Please try again later.'
      });
    }

    // Verify password
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      // Increment failed login attempts
      const nextFailedAttempts = (user.failedLoginAttempts || 0) + 1;
      const lockAccount = nextFailedAttempts >= 5;

      await prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginAttempts: lockAccount ? 0 : nextFailedAttempts,
          lockedUntil: lockAccount ? new Date(Date.now() + 15 * 60 * 1000) : null
        }
      });

      // Log audit
      await adminAuditLogger.log({
        adminId: user.id,
        action: 'admin.login.failed',
        resource: 'Admin',
        success: false,
        errorMessage: 'Invalid password',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent']
      });

      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Check if account is active
    if (user.status !== 'ACTIVE') {
      return res.status(403).json({
        success: false,
        message: 'Account is not active'
      });
    }

    // Reset failed login attempts
    await prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginAttempts: 0,
        lockedUntil: null
      }
    });

    // Generate and send OTP for MFA
    const rawOtp = await otpService.generateOTP(user.id, 'ADMIN_LOGIN');
    
    try {
      await otpService.sendOTPEmail(user, rawOtp);
    } catch (emailError) {
      console.error('Failed to send admin OTP email:', emailError);
      return res.status(500).json({
        success: false,
        message: 'Failed to send OTP. Please try again.'
      });
    }

    // Log audit
    await adminAuditLogger.log({
      adminId: user.id,
      action: 'admin.login.otp_sent',
      resource: 'Admin',
      success: true,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });

    res.json({
      success: true,
      message: 'OTP sent to your email. Please verify to complete login.',
      data: {
        email: user.email,
        requiresOtp: true
      }
    });
  } catch (error) {
    console.error('Admin login error:', error);
    res.status(500).json({
      success: false,
      message: 'Login failed',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Verify OTP and complete admin login
const verifyAdminLoginOtp = async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({
        success: false,
        message: 'Email and OTP are required'
      });
    }

    // Find admin user
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      include: {
        adminProfile: true
      }
    });

    if (!user || user.role !== 'ADMIN') {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Verify OTP
    const otpVerification = await otpService.verifyOTP(user.id, otp, 'ADMIN_LOGIN');
    
    if (!otpVerification.success) {
      // Log audit
      await adminAuditLogger.log({
        adminId: user.id,
        action: 'admin.login.otp_failed',
        resource: 'Admin',
        success: false,
        errorMessage: otpVerification.message,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent']
      });

      return res.status(400).json({
        success: false,
        message: otpVerification.message
      });
    }

    // Generate JWT token with 30-minute expiry for admin
    const token = jwt.sign(
      {
        userId: user.id,
        id: user.id,
        role: user.role,
        tokenVersion: user.tokenVersion || 0
      },
      getJwtSecret(),
      { expiresIn: '30m' } // 30 minutes for admin sessions
    );

    // Set HttpOnly cookie
    res.cookie('authToken', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      maxAge: 30 * 60 * 1000 // 30 minutes
    });

    // Update last login
    await prisma.user.update({
      where: { id: user.id },
      data: {
        lastActive: new Date()
      }
    });

    // Log audit
    await adminAuditLogger.log({
      adminId: user.id,
      action: 'admin.login.success',
      resource: 'Admin',
      success: true,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });

    res.json({
      success: true,
      message: 'Login successful',
      data: {
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role
        },
        token
      }
    });
  } catch (error) {
    console.error('Admin OTP verification error:', error);
    res.status(500).json({
      success: false,
      message: 'OTP verification failed',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Admin password reset request
const requestAdminPasswordReset = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email is required'
      });
    }

    // Find admin user
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() }
    });

    // Always return success to avoid account enumeration
    if (!user || user.role !== 'ADMIN') {
      return res.json({
        success: true,
        message: 'If an admin account exists for that email, a reset OTP has been sent.'
      });
    }

    // Generate OTP for password reset
    const rawOtp = await otpService.generateOTP(user.id, 'ADMIN_PASSWORD_RESET');
    
    try {
      await otpService.sendOTPEmail(user, rawOtp);
    } catch (emailError) {
      console.error('Failed to send admin password reset email:', emailError);
      // Still return success to avoid enumeration
    }

    // Log audit
    await adminAuditLogger.log({
      adminId: user.id,
      action: 'admin.password_reset_requested',
      resource: 'Admin',
      success: true,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });

    res.json({
      success: true,
      message: 'If an admin account exists for that email, a reset OTP has been sent.'
    });
  } catch (error) {
    console.error('Admin password reset request error:', error);
    res.json({
      success: true,
      message: 'If an admin account exists for that email, a reset OTP has been sent.'
    });
  }
};

// Verify OTP and reset admin password
const resetAdminPassword = async (req, res) => {
  try {
    const { email, otp, newPassword, confirmPassword } = req.body;

    if (!email || !otp || !newPassword || !confirmPassword) {
      return res.status(400).json({
        success: false,
        message: 'Email, OTP, new password, and confirmation are required'
      });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({
        success: false,
        message: 'Passwords do not match'
      });
    }

    // Validate password complexity
    const passwordValidation = validateAdminPassword(newPassword);
    if (!passwordValidation.valid) {
      return res.status(400).json({
        success: false,
        message: passwordValidation.message
      });
    }

    // Find admin user
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() }
    });

    if (!user || user.role !== 'ADMIN') {
      return res.status(400).json({
        success: false,
        message: 'Invalid email or OTP'
      });
    }

    // Verify OTP
    const otpVerification = await otpService.verifyOTP(user.id, otp, 'ADMIN_PASSWORD_RESET');
    
    if (!otpVerification.success) {
      return res.status(400).json({
        success: false,
        message: otpVerification.message
      });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 12);

    // Update password and increment token version to invalidate existing sessions
    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        passwordChangedAt: new Date(),
        tokenVersion: { increment: 1 },
        failedLoginAttempts: 0,
        lockedUntil: null
      }
    });

    // Log audit
    await adminAuditLogger.log({
      adminId: user.id,
      action: 'admin.password_reset_completed',
      resource: 'Admin',
      success: true,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });

    res.json({
      success: true,
      message: 'Password reset successful. Please log in with your new password.'
    });
  } catch (error) {
    console.error('Admin password reset error:', error);
    res.status(500).json({
      success: false,
      message: 'Password reset failed',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

module.exports = {
  setupAdmin,
  adminLogin,
  verifyAdminLoginOtp,
  requestAdminPasswordReset,
  resetAdminPassword,
  validateAdminPassword
};
