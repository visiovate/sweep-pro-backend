const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const notificationService = require('../services/notificationService');

const prisma = new PrismaClient();

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
    const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET || 'fallback-secret-key');

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
    const { name, phone, address } = req.body;

    const user = await prisma.user.update({
      where: { id: userId },
      data: {
        name,
        phone,
        address
      },
      include: {
        customerProfile: true,
        maidProfile: true,
        adminProfile: true
      }
    });

    // Remove password from response
    const { password, ...userWithoutPassword } = user;

    // Send notification
    await notificationService.notifyUserProfileUpdate(user);

    res.json({ user: userWithoutPassword });
  } catch (error) {
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
        timeSlot: true,
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
