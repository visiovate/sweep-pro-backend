const express = require('express');
const { body } = require('express-validator');
const { authenticateToken, authorizeAdmin } = require('../middleware/auth');
const checkBufferEligibility = require('../middleware/bufferEligibility');
const prisma = require('../middleware/prisma');
const bufferController = require('../controllers/bufferController');

const router = express.Router();

// Apply prisma middleware to all routes
router.use(prisma);

/**
 * @route   GET /api/buffer/subscription/:subscriptionId/remaining
 * @desc    Get remaining buffer days for a subscription (customer)
 * @access  Private (Customer - SweePro Lux only)
 */
router.get(
  '/subscription/:subscriptionId/remaining',
  authenticateToken,
  checkBufferEligibility,
  bufferController.getRemainingBufferDays
);

/**
 * @route   POST /api/buffer/subscription/:subscriptionId/request
 * @desc    Request buffer days (customer)
 * @access  Private (Customer - SweePro Lux only)
 */
router.post(
  '/subscription/:subscriptionId/request',
  authenticateToken,
  checkBufferEligibility,
  [
    body('daysCount')
      .isInt({ min: 1, max: 7 })
      .withMessage('Days count must be between 1 and 7'),
    body('startDate')
      .isISO8601()
      .toDate()
      .withMessage('Valid start date is required'),
    body('reason')
      .trim()
      .isLength({ min: 3, max: 200 })
      .withMessage('Reason must be between 3 and 200 characters'),
    body('notes')
      .optional()
      .trim()
      .isLength({ max: 500 })
      .withMessage('Notes must not exceed 500 characters')
  ],
  bufferController.requestBufferDays
);

/**
 * @route   GET /api/buffer/subscription/:subscriptionId/history
 * @desc    Get customer's buffer history (customer)
 * @access  Private (Customer - SweePro Lux only)
 */
router.get(
  '/subscription/:subscriptionId/history',
  authenticateToken,
  checkBufferEligibility,
  bufferController.getCustomerBufferHistory
);

/**
 * @route   GET /api/buffer/admin/pending
 * @desc    Get pending buffer requests (admin)
 * @access  Private (Admin)
 */
router.get(
  '/admin/pending',
  authenticateToken,
  authorizeAdmin,
  bufferController.getPendingBufferRequests
);

/**
 * @route   POST /api/buffer/admin/:bufferPeriodId/approve
 * @desc    Approve buffer request (admin)
 * @access  Private (Admin)
 */
router.post(
  '/admin/:bufferPeriodId/approve',
  authenticateToken,
  authorizeAdmin,
  [
    body('adminNotes')
      .optional()
      .trim()
      .isLength({ max: 500 })
      .withMessage('Admin notes must not exceed 500 characters')
  ],
  bufferController.approveBufferRequest
);

/**
 * @route   POST /api/buffer/admin/:bufferPeriodId/reject
 * @desc    Reject buffer request (admin)
 * @access  Private (Admin)
 */
router.post(
  '/admin/:bufferPeriodId/reject',
  authenticateToken,
  authorizeAdmin,
  [
    body('rejectionReason')
      .trim()
      .isLength({ min: 3, max: 300 })
      .withMessage('Rejection reason must be between 3 and 300 characters')
  ],
  bufferController.rejectBufferRequest
);

/**
 * @route   GET /api/buffer/admin/all
 * @desc    Get all buffer periods (admin)
 * @access  Private (Admin)
 */
router.get(
  '/admin/all',
  authenticateToken,
  authorizeAdmin,
  bufferController.getAllBufferPeriods
);

/**
 * @route   GET /api/buffer/admin/statistics
 * @desc    Get buffer statistics for admin dashboard (admin)
 * @access  Private (Admin)
 */
router.get(
  '/admin/statistics',
  authenticateToken,
  authorizeAdmin,
  bufferController.getBufferStatistics
);

/**
 * @route   GET /api/buffer/admin/affected-services
 * @desc    Get services affected by buffer periods (admin)
 * @access  Private (Admin)
 */
router.get(
  '/admin/affected-services',
  authenticateToken,
  authorizeAdmin,
  bufferController.getAffectedServices
);

/**
 * @route   GET /api/buffer/subscription/:subscriptionId/check-conflict
 * @desc    Check if a date conflicts with buffer periods (customer)
 * @access  Private (Customer - SweePro Lux only)
 */
router.get(
  '/subscription/:subscriptionId/check-conflict',
  authenticateToken,
  checkBufferEligibility,
  bufferController.checkBufferConflict
);

/**
 * @route   GET /api/buffer/subscription/:subscriptionId/current-status
 * @desc    Check current buffer period status (customer)
 * @access  Private (Customer - SweePro Lux only)
 */
router.get(
  '/subscription/:subscriptionId/current-status',
  authenticateToken,
  checkBufferEligibility,
  bufferController.getCurrentBufferStatus
);

/**
 * @route   POST /api/buffer/admin/cleanup-notes
 * @desc    Clean up malformed buffer request notes (admin utility)
 * @access  Private (Admin)
 */
router.post(
  '/admin/cleanup-notes',
  authenticateToken,
  authorizeAdmin,
  bufferController.cleanupMalformedNotes
);

module.exports = router;
