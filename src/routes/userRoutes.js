const express = require('express');
const router = express.Router();
const { authenticateToken, authorizeAdmin } = require('../middleware/auth');
const {
  registerValidation,
  loginValidation,
  updateProfileValidation,
  updateRoleValidation,
  updateStatusValidation,
  userIdValidation
} = require('../middleware/validation');
const {
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
} = require('../controllers/userController');

// Public routes
router.post('/register', registerValidation, register);
router.post('/login', loginValidation, login);

// Protected routes
router.get('/profile', authenticateToken, getProfile);
router.put('/profile', authenticateToken, updateProfileValidation, updateProfile);

// Admin only routes
router.get('/', authenticateToken, authorizeAdmin, getAllUsers);
router.get('/:id', authenticateToken, authorizeAdmin, userIdValidation, getUserById);
router.put('/:id/role', authenticateToken, authorizeAdmin, updateRoleValidation, updateUserRole);
router.put('/:id/status', authenticateToken, authorizeAdmin, updateStatusValidation, updateUserStatus);
router.put('/:id/details', authenticateToken, authorizeAdmin, updateUserDetails);
router.delete('/:id', authenticateToken, authorizeAdmin, userIdValidation, deleteUser);

// Additional route for authenticated user updates (matches frontend API_ENDPOINTS.USER.UPDATE)
router.put('/update', authenticateToken, updateProfileValidation, updateProfile);

module.exports = router; 
