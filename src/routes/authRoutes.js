const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { registerValidation, loginValidation } = require('../middleware/validation');
const { authenticateToken } = require('../middleware/auth');
const notificationService = require('../services/notificationService');

const prisma = new PrismaClient();

router.post('/register', registerValidation, async (req, res) => {
  try {
    const { name, email, phone, role, password,timeSlot, confirmPassword, address } = req.body;
    
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

    // Create user with transaction to ensure consistency
    const result = await prisma.$transaction(async (tx) => {
      // Create the main user
      const user = await tx.user.create({
        data: {
          name,
          email,
          phone,
          role,
          timeSlot,
          password: hashedPassword,
          address,
          status: 'ACTIVE'
        }
      });

      // Create role-specific profile based on user role
      if (role === 'CUSTOMER') {
        await tx.customerProfile.create({
          data: {
            userId: user.id,
            preferences: {},
            emergencyContact: null,
            specialInstructions: null
          }
        });
      } else if (role === 'MAID') {
        await tx.maidProfile.create({
          data: {
            userId: user.id,
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

      return user;
    });

    // Generate JWT token
    const token = jwt.sign(
      { 
        userId: result.id,
        id: result.id,
        role: result.role
      },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '24h' }
    );

    // Send notification about new user registration
    try {
      await notificationService.notifyUserRegistration(result);
    } catch (notificationError) {
      console.error('Failed to send registration notification:', notificationError);
      // Don't fail the registration if notification fails
    }

    // Prepare response without sensitive data
    const userResponse = {
      id: result.id,
      name: result.name,
      email: result.email,
      phone: result.phone,
      timeSlot: result.timeSlot,
      address: result.address,
      role: result.role,
      status: result.status,
      createdAt: result.createdAt
    };

    res.status(201).json({
      success: true,
      message: `${role.charAt(0) + role.slice(1).toLowerCase()} registered successfully`,
      data: {
        user: userResponse,
        token
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

// Login route
router.post('/login', loginValidation, async (req, res) => {
  try {
    const { email, password } = req.body;

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
    const token = jwt.sign(
      { 
        userId: user.id,
        id: user.id,
        role: user.role
      },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '24h' }
    );

    // Prepare user response without password
    const userResponse = {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      address: user.address,
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
      message: 'Login successful',
      data: {
        user: userResponse,
        token
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
      phone: user.phone,
      address: user.address,
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

// Logout endpoint (optional - mainly for clearing client-side token)
router.post('/logout', authenticateToken, async (req, res) => {
  try {
    // In a stateless JWT system, logout is handled client-side by removing the token
    // This endpoint can be used for logging or additional cleanup if needed
    
    res.json({
      success: true,
      message: 'Logout successful'
    });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({
      success: false,
      message: 'Logout failed'
    });
  }
});

// Create test admin user (for development only)
if (process.env.NODE_ENV !== 'production') {
  router.post('/create-test-admin', async (req, res) => {
    try {
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
