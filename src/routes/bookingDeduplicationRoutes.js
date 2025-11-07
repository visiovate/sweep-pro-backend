const express = require('express');
const router = express.Router();
const bookingDeduplicationService = require('../services/bookingDeduplicationService');
const { authenticate, authorize } = require('../middleware/auth');

/**
 * Get deduplication statistics
 * Admin only
 */
router.get('/stats', authenticate, authorize(['ADMIN']), async (req, res) => {
  try {
    const stats = await bookingDeduplicationService.getStats();
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Error getting deduplication stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get deduplication statistics',
      error: error.message
    });
  }
});

/**
 * Check if a booking request is duplicate
 * Admin only
 */
router.post('/check', authenticate, authorize(['ADMIN']), async (req, res) => {
  try {
    const { customerId, maidId, scheduledDate } = req.body;

    if (!customerId || !maidId || !scheduledDate) {
      return res.status(400).json({
        success: false,
        message: 'customerId, maidId, and scheduledDate are required'
      });
    }

    const isDuplicate = await bookingDeduplicationService.isDuplicate(
      customerId,
      maidId,
      scheduledDate
    );

    const info = await bookingDeduplicationService.getInfo(
      customerId,
      maidId,
      scheduledDate
    );

    res.json({
      success: true,
      data: {
        isDuplicate,
        info
      }
    });
  } catch (error) {
    console.error('Error checking duplicate:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to check duplicate',
      error: error.message
    });
  }
});

/**
 * Remove a booking request marker
 * Admin only
 */
router.delete('/remove', authenticate, authorize(['ADMIN']), async (req, res) => {
  try {
    const { customerId, maidId, scheduledDate } = req.body;

    if (!customerId || !maidId || !scheduledDate) {
      return res.status(400).json({
        success: false,
        message: 'customerId, maidId, and scheduledDate are required'
      });
    }

    const removed = await bookingDeduplicationService.remove(
      customerId,
      maidId,
      scheduledDate
    );

    res.json({
      success: true,
      message: removed ? 'Booking marker removed successfully' : 'Booking marker not found',
      data: { removed }
    });
  } catch (error) {
    console.error('Error removing booking marker:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to remove booking marker',
      error: error.message
    });
  }
});

/**
 * Clear all deduplication markers
 * Admin only - use with caution
 */
router.post('/clear-all', authenticate, authorize(['ADMIN']), async (req, res) => {
  try {
    const cleared = await bookingDeduplicationService.clearAll();

    res.json({
      success: true,
      message: cleared ? 'All booking markers cleared successfully' : 'Failed to clear markers',
      data: { cleared }
    });
  } catch (error) {
    console.error('Error clearing all markers:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to clear all markers',
      error: error.message
    });
  }
});

module.exports = router;
