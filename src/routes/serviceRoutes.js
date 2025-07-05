const express = require('express');
const router = express.Router();
const { authenticateToken, authorizeAdmin } = require('../middleware/auth');
const {
  createService,
  getAllServices,
  getServiceById,
  updateService,
  deleteService
} = require('../controllers/serviceController');

// Public routes
router.get('/', getAllServices);
router.get('/:id', getServiceById);

// Admin routes
router.post('/', authenticateToken, authorizeAdmin, createService);
router.put('/:id', authenticateToken, authorizeAdmin, updateService);
router.delete('/:id', authenticateToken, authorizeAdmin, deleteService);

module.exports = router; 