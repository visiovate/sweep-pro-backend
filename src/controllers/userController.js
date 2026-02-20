const { getPrismaClient } = require('../utils/database');
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const notificationService = require('../services/notificationService');
// SECURITY: Import JWT secret getter
const { getJwtSecret } = require('../config/validateEnv');

const prisma = getPrismaClient();

// Note: Registration is now handled in authRoutes.js
// This method is kept for backward compatibility if needed
const register = async (req, res) => {
  return res.status(410).json({ 
    success: false,
    message: 'This registration endpoint is deprecated. Please use /api/auth/register instead.',
    redirectTo: '/api/auth/register'
  });
};

const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Find user
    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        customerProfile: true,
        maidProfile: true,
        adminProfile: true
      }
    });

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Generate JWT token
    // SECURITY: Use centralized JWT secret getter - NEVER use fallback
    const token = jwt.sign({ id: user.id }, getJwtSecret());

    // Remove password from response
    const { password: _, ...userWithoutPassword } = user;

    res.json({ user: userWithoutPassword, token });
  } catch (error) {
    console.error('Error logging in:', error);
    res.status(500).json({ error: 'Error logging in' });
  }
};

const getProfile = async (req, res) => {
  try {
    const userId = req.user.id;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        customerProfile: true,
        maidProfile: true,
        adminProfile: true
      }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Remove password from response
    const { password, ...userWithoutPassword } = user;

    res.json({ user: userWithoutPassword });
  } catch (error) {
    res.status(500).json({ error: 'Error fetching profile' });
  }
};





const updateProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    const { name, phone, address, latitude, longitude, pincode, locality, addressLine, city, state, landmark } = req.body;

    // Build user update payload dynamically to avoid overwriting with undefined
    const userUpdateData = {};
    if (typeof name !== 'undefined') userUpdateData.name = name;
    if (typeof phone !== 'undefined') userUpdateData.phone = phone;
    if (typeof address !== 'undefined') userUpdateData.address = address;
    if (typeof latitude !== 'undefined') userUpdateData.latitude = Number(latitude);
    if (typeof longitude !== 'undefined') userUpdateData.longitude = Number(longitude);

    const user = await prisma.user.update({
      where: { id: userId },
      data: userUpdateData,
      include: {
        customerProfile: true,
        maidProfile: true,
        adminProfile: true
      }
    });

    // Also persist extended address details into CustomerProfile.preferences.serviceAddress
    const hasExtendedAddress = [pincode, locality, addressLine, city, state, landmark, address, latitude, longitude]
      .some((v) => typeof v !== 'undefined' && v !== null && v !== '');

    if (hasExtendedAddress) {
      // Obtain existing preferences
      const existingProfile = await prisma.customerProfile.findUnique({ where: { userId } });
      const existingPrefs = existingProfile?.preferences || {};
      const newServiceAddress = {
        address: address ?? existingPrefs?.serviceAddress?.address ?? null,
        pincode: pincode ?? existingPrefs?.serviceAddress?.pincode ?? null,
        locality: locality ?? existingPrefs?.serviceAddress?.locality ?? null,
        addressLine: addressLine ?? existingPrefs?.serviceAddress?.addressLine ?? null,
        city: city ?? existingPrefs?.serviceAddress?.city ?? null,
        state: state ?? existingPrefs?.serviceAddress?.state ?? null,
        landmark: landmark ?? existingPrefs?.serviceAddress?.landmark ?? null,
        latitude: typeof latitude !== 'undefined' ? Number(latitude) : (existingPrefs?.serviceAddress?.latitude ?? null),
        longitude: typeof longitude !== 'undefined' ? Number(longitude) : (existingPrefs?.serviceAddress?.longitude ?? null),
        updatedAt: new Date().toISOString(),
      };

      const newPrefs = { ...existingPrefs, serviceAddress: newServiceAddress };

      await prisma.customerProfile.upsert({
        where: { userId },
        update: { preferences: newPrefs },
        create: { userId, preferences: newPrefs },
      });
    }

    // Remove password from response
    const { password, ...userWithoutPassword } = user;

    // Send notification (non-blocking)
    try {
      await notificationService.notifyUserProfileUpdate(user);
    } catch (e) {
      console.warn('Notification failed:', e?.message || e);
    }

    res.json({ user: userWithoutPassword });
  } catch (error) {
    console.error('Error updating profile:', error);
    res.status(500).json({ error: 'Error updating profile' });
  }
};

const getAllUsers = async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        address: true,
        role: true,
        status: true,
        createdAt: true,
      },
    });
    res.json({
      success: true,
      data: users
    });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ message: 'Failed to fetch users' });
  }
};

const getUserById = async (req, res) => {
  try {
    const { id } = req.params;
    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        status: true,
        createdAt: true,
      },
    });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json(user);
  } catch (error) {
    console.error('Error fetching user:', error);
    res.status(500).json({ message: 'Failed to fetch user' });
  }
};

const updateUserRole = async (req, res) => {
  try {
    const { id } = req.params;
    const { role } = req.body;

    if (!['ADMIN', 'MAID', 'CUSTOMER'].includes(role)) {
      return res.status(400).json({ message: 'Invalid role' });
    }

    const updatedUser = await prisma.user.update({
      where: { id },
      data: { role },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        status: true,
      },
    });

    res.json(updatedUser);
  } catch (error) {
    console.error('Error updating user role:', error);
    res.status(500).json({ message: 'Failed to update user role' });
  }
};

const updateUserStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!['ACTIVE', 'INACTIVE', 'SUSPENDED', 'BLACKLISTED'].includes(status)) {
      return res.status(400).json({ message: 'Invalid status' });
    }

    const updatedUser = await prisma.user.update({
      where: { id },
      data: { status },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        status: true,
      },
    });

    res.json(updatedUser);
  } catch (error) {
    console.error('Error updating user status:', error);
    res.status(500).json({ message: 'Failed to update user status' });
  }
};

const updateUserDetails = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, phone, address, timeSlot } = req.body;

    // Validate input
    if (!name && !phone && !address && !timeSlot) {
      return res.status(400).json({ message: 'At least one field must be provided for update' });
    }

    // Build update data object
    const updateData = {};
    if (name) updateData.name = name;
    if (phone) updateData.phone = phone;
    if (address) updateData.address = address;
    if (timeSlot) updateData.timeSlot = timeSlot;

    const updatedUser = await prisma.user.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        address: true,
        timeSlot: true,
        role: true,
        status: true,
        createdAt: true,
      },
    });

    res.json({
      success: true,
      data: updatedUser,
      message: 'User details updated successfully'
    });
  } catch (error) {
    console.error('Error updating user details:', error);
    if (error.code === 'P2002') {
      return res.status(400).json({ message: 'Phone number already exists' });
    }
    res.status(500).json({ message: 'Failed to update user details' });
  }
};

const deleteUser = async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.user.delete({
      where: { id },
    });
    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ message: 'Failed to delete user' });
  }
};

module.exports = {
  register,
  login,
  getProfile,
  updateProfile,
  getAllUsers,
  getUserById,
  updateUserRole,
  updateUserStatus,
  updateUserDetails,
  deleteUser
};
