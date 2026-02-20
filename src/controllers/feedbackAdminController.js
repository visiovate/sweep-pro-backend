const { getPrismaClient } = require('../utils/database');
const { PrismaClient } = require('@prisma/client');
const ratingRecalculationService = require('../services/ratingRecalculationService');
const feedbackAuditService = require('../services/feedbackAuditService');
const feedbackAnalyticsService = require('../services/feedbackAnalyticsService');
const notificationService = require('../services/notificationService');

const prisma = getPrismaClient();

/**
 * Enhanced Feedback Admin Controllers
 * Advanced admin operations for feedback management
 */

/**
 * Change feedback status (DISPUTED, RESOLVED, REMOVED, INVALID)
 */
const changeFeedbackStatus = async (req, res) => {
  try {
    const { feedbackId } = req.params;
    const { status, reason } = req.body;
    const adminId = req.user.id;

    // Validate status
    const validStatuses = ['DISPUTED', 'RESOLVED', 'REMOVED', 'INVALID'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid status. Must be one of: DISPUTED, RESOLVED, REMOVED, INVALID'
      });
    }

    // Get feedback
    const feedback = await prisma.feedback.findUnique({
      where: { id: feedbackId },
      include: {
        booking: {
          include: {
            maid: true
          }
        }
      }
    });

    if (!feedback) {
      return res.status(404).json({
        success: false,
        error: 'Feedback not found'
      });
    }

    const oldStatus = feedback.status;

    // Handle the status change and rating recalculation
    const result = await ratingRecalculationService.handleFeedbackStatusChange(
      feedbackId,
      status,
      oldStatus,
      adminId,
      reason
    );

    res.json({
      success: true,
      message: `Feedback status changed from ${oldStatus} to ${status}`,
      data: {
        feedback: result.feedback,
        ratingRecalculation: result.ratingRecalculation,
        audit: await feedbackAuditService.getAuditTrail(feedbackId)
      }
    });
  } catch (error) {
    console.error('[FeedbackController] Error changing status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to change feedback status',
      details: error.message
    });
  }
};

/**
 * Adjust feedback weight (multiplier for rating calculation)
 */
const adjustFeedbackWeight = async (req, res) => {
  try {
    const { feedbackId } = req.params;
    const { weight, reason } = req.body;
    const adminId = req.user.id;

    // Validate weight
    if (weight === undefined || typeof weight !== 'number') {
      return res.status(400).json({
        success: false,
        error: 'Weight must be a number'
      });
    }

    if (weight < 0 || weight > 2) {
      return res.status(400).json({
        success: false,
        error: 'Weight must be between 0 and 2'
      });
    }

    // Adjust weight
    const result = await ratingRecalculationService.adjustFeedbackWeight(
      feedbackId,
      weight,
      adminId,
      reason
    );

    res.json({
      success: true,
      message: 'Feedback weight adjusted successfully',
      data: {
        feedback: result.feedback,
        ratingRecalculation: result.ratingRecalculation
      }
    });
  } catch (error) {
    console.error('[FeedbackController] Error adjusting weight:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to adjust feedback weight',
      details: error.message
    });
  }
};

/**
 * Get maid feedback analytics and performance
 */
const getMaidFeedbackAnalytics = async (req, res) => {
  try {
    const { maidId } = req.params;
    const { days = 30, includeHistory = true } = req.query;

    const analytics = await feedbackAnalyticsService.getMaidFeedbackAnalytics(
      maidId,
      {
        days: parseInt(days),
        includeHistory: includeHistory === 'true'
      }
    );

    res.json({
      success: true,
      data: analytics
    });
  } catch (error) {
    console.error('[FeedbackController] Error getting maid analytics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch maid analytics',
      details: error.message
    });
  }
};

/**
 * Get audit trail for a feedback entry
 */
const getFeedbackAuditTrail = async (req, res) => {
  try {
    const { feedbackId } = req.params;

    const auditTrail = await feedbackAuditService.getAuditTrail(feedbackId);

    res.json({
      success: true,
      data: {
        feedbackId,
        auditEntries: auditTrail,
        totalActions: auditTrail.length
      }
    });
  } catch (error) {
    console.error('[FeedbackController] Error getting audit trail:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch audit trail',
      details: error.message
    });
  }
};

/**
 * Get recent feedback for a maid
 */
const getMaidRecentFeedback = async (req, res) => {
  try {
    const { maidId } = req.params;
    const { limit = 10 } = req.query;

    const feedbacks = await prisma.feedback.findMany({
      where: {
        OR: [
          { ratedMaidId: maidId },
          { ratedMaidId: null, booking: { maidId } }
        ],
        status: 'ACTIVE'
      },
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            profileImage: true
          }
        },
        booking: {
          select: {
            id: true,
            service: {
              select: {
                name: true
              }
            }
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      },
      take: parseInt(limit)
    });

    res.json({
      success: true,
      data: {
        maidId,
        feedbackCount: feedbacks.length,
        feedbacks
      }
    });
  } catch (error) {
    console.error('[FeedbackController] Error getting recent feedback:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch recent feedback',
      details: error.message
    });
  }
};

/**
 * Recalculate maid rating from all feedback
 */
const recalculateMaidRating = async (req, res) => {
  try {
    const { maidId } = req.params;
    const adminId = req.user.id;

    const result = await ratingRecalculationService.recalculateMaidRating(maidId, adminId);

    res.json({
      success: true,
      message: 'Maid rating recalculated successfully',
      data: result
    });
  } catch (error) {
    console.error('[FeedbackController] Error recalculating rating:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to recalculate maid rating',
      details: error.message
    });
  }
};

/**
 * Get disputed feedback list
 */
const getDisputedFeedback = async (req, res) => {
  try {
    const { page = 1, limit = 20, status = 'DISPUTED' } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const where = {};
    if (status === 'DISPUTED') {
      where.status = 'DISPUTED';
    } else if (status === 'PENDING') {
      where.status = 'DISPUTED';
      where.resolutionNote = null;
    } else if (status === 'RESOLVED') {
      where.status = 'RESOLVED';
    }

    const [feedbacks, total] = await Promise.all([
      prisma.feedback.findMany({
        where,
        include: {
          customer: {
            select: {
              id: true,
              name: true,
              email: true,
              profileImage: true
            }
          },
          booking: {
            include: {
              maid: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                  profileImage: true,
                  maidProfile: {
                    select: {
                      rating: true,
                      totalRatings: true
                    }
                  }
                }
              },
              service: {
                select: {
                  name: true
                }
              }
            }
          }
        },
        orderBy: {
          createdAt: 'desc'
        },
        skip,
        take: parseInt(limit)
      }),
      prisma.feedback.count({ where })
    ]);

    res.json({
      success: true,
      data: feedbacks,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('[FeedbackController] Error getting disputed feedback:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch disputed feedback',
      details: error.message
    });
  }
};

/**
 * Calculate rating impact of a potential change
 */
const calculateRatingImpact = async (req, res) => {
  try {
    const { feedbackId } = req.params;
    const { changeType, newValue } = req.body;

    const impact = await ratingRecalculationService.calculateRatingImpact(
      feedbackId,
      changeType,
      newValue
    );

    res.json({
      success: true,
      data: impact
    });
  } catch (error) {
    console.error('[FeedbackController] Error calculating impact:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to calculate rating impact',
      details: error.message
    });
  }
};

/**
 * Get maid performance report
 */
const getMaidPerformanceReport = async (req, res) => {
  try {
    const { maidId } = req.params;
    const { month, year } = req.query;

    const reportMonth = month ? parseInt(month) : new Date().getMonth() + 1;
    const reportYear = year ? parseInt(year) : new Date().getFullYear();

    const report = await feedbackAnalyticsService.generateMaidPerformanceReport(
      maidId,
      reportMonth,
      reportYear
    );

    res.json({
      success: true,
      data: report
    });
  } catch (error) {
    console.error('[FeedbackController] Error generating report:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate performance report',
      details: error.message
    });
  }
};

/**
 * Get admin feedback dashboard stats
 */
const getAdminDashboardStats = async (req, res) => {
  try {
    const { maidId = null, days = 30 } = req.query;

    const stats = await feedbackAnalyticsService.getAdminFeedbackStats({
      maidId,
      days: parseInt(days)
    });

    const auditStats = await feedbackAuditService.getAuditSummary({
      startDate: new Date(Date.now() - parseInt(days) * 24 * 60 * 60 * 1000),
      endDate: new Date()
    });

    res.json({
      success: true,
      data: {
        feedbackStats: stats,
        auditStats
      }
    });
  } catch (error) {
    console.error('[FeedbackController] Error getting dashboard stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch dashboard stats',
      details: error.message
    });
  }
};

/**
 * Batch recalculate all maid ratings
 */
const batchRecalculateRatings = async (req, res) => {
  try {
    const { flaggedOnly = false } = req.body;

    const result = await ratingRecalculationService.recalculateAllMaidRatings({
      flaggedOnly
    });

    res.json({
      success: true,
      message: `Batch recalculation completed for ${result.totalProcessed} maids`,
      data: result
    });
  } catch (error) {
    console.error('[FeedbackController] Error in batch recalculation:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to complete batch recalculation',
      details: error.message
    });
  }
};

/**
 * Add admin note to feedback
 */
const addFeedbackNote = async (req, res) => {
  try {
    const { feedbackId } = req.params;
    const { note, isVerified } = req.body;
    const adminId = req.user.id;

    const feedback = await prisma.feedback.update({
      where: { id: feedbackId },
      data: {
        resolutionNote: note,
        verificationFlag: isVerified === false ? false : feedback?.verificationFlag
      },
      include: {
        booking: {
          include: {
            maid: true
          }
        }
      }
    });

    // Log the action
    await feedbackAuditService.logFeedbackAction(feedbackId, adminId, 'ADMIN_RESPONSE_ADDED', {
      reason: 'Admin note added',
      note
    });

    res.json({
      success: true,
      message: 'Admin note added successfully',
      data: feedback
    });
  } catch (error) {
    console.error('[FeedbackController] Error adding note:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to add admin note',
      details: error.message
    });
  }
};

/**
 * Mark feedback as verified/flagged
 */
const toggleFeedbackVerification = async (req, res) => {
  try {
    const { feedbackId } = req.params;
    const { verified } = req.body;

    const feedback = await prisma.feedback.update({
      where: { id: feedbackId },
      data: {
        verificationFlag: !verified
      }
    });

    res.json({
      success: true,
      message: `Feedback marked as ${verified ? 'verified' : 'flagged'}`,
      data: feedback
    });
  } catch (error) {
    console.error('[FeedbackController] Error toggling verification:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to toggle verification',
      details: error.message
    });
  }
};

/**
 * Get audit summary report
 */
const getAuditSummary = async (req, res) => {
  try {
    const { days = 30, action = null } = req.query;

    const summary = await feedbackAuditService.getAuditSummary({
      startDate: new Date(Date.now() - parseInt(days) * 24 * 60 * 60 * 1000),
      endDate: new Date(),
      action
    });

    res.json({
      success: true,
      data: summary
    });
  } catch (error) {
    console.error('[FeedbackController] Error getting audit summary:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch audit summary',
      details: error.message
    });
  }
};

module.exports = {
  changeFeedbackStatus,
  adjustFeedbackWeight,
  getMaidFeedbackAnalytics,
  getFeedbackAuditTrail,
  getMaidRecentFeedback,
  recalculateMaidRating,
  getDisputedFeedback,
  calculateRatingImpact,
  getMaidPerformanceReport,
  getAdminDashboardStats,
  batchRecalculateRatings,
  addFeedbackNote,
  toggleFeedbackVerification,
  getAuditSummary
};
