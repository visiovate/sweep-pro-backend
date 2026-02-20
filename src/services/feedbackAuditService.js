const { getPrismaClient } = require('../utils/database');
const { PrismaClient } = require('@prisma/client');
const prisma = getPrismaClient();

/**
 * Feedback Audit Service
 * Handles logging and tracking of all admin actions on feedback
 */

class FeedbackAuditService {
  /**
   * Create an audit entry for feedback action
   */
  async logFeedbackAction(feedbackId, adminId, action, details = {}) {
    try {
      // Get the feedback before the change
      const feedback = await getPrismaClient().feedback.findUnique({
        where: { id: feedbackId },
        include: {
          booking: {
            include: {
              maid: {
                include: {
                  maidProfile: true
                }
              }
            }
          }
        }
      });

      if (!feedback) {
        throw new Error('Feedback not found');
      }

      // Calculate previous rating if applicable
      let previousRating = null;
      let newRating = null;

      if (feedback.booking?.maid?.maidProfile) {
        previousRating = feedback.booking.maid.maidProfile.rating;
      }

      // Prepare audit entry
      const auditEntry = await getPrismaClient().feedbackAudit.create({
        data: {
          feedbackId,
          adminId,
          action,
          note: details.reason || details.note || null,
          previousValue: details.previousValue ? JSON.stringify(details.previousValue) : null,
          newValue: details.newValue ? JSON.stringify(details.newValue) : null,
          deltaRating: details.deltaRating || 0
        },
        include: {
          admin: {
            select: {
              id: true,
              name: true,
              email: true
            }
          }
        }
      });

      console.log(`[AUDIT] Action: ${action} on Feedback: ${feedbackId} by Admin: ${adminId}`);
      return auditEntry;
    } catch (error) {
      console.error('[FeedbackAuditService] Error logging action:', error);
      throw error;
    }
  }

  /**
   * Get complete audit trail for a feedback
   */
  async getAuditTrail(feedbackId) {
    try {
      const auditEntries = await getPrismaClient().feedbackAudit.findMany({
        where: { feedbackId },
        include: {
          admin: {
            select: {
              id: true,
              name: true,
              email: true,
              profileImage: true
            }
          }
        },
        orderBy: { createdAt: 'asc' }
      });

      return auditEntries;
    } catch (error) {
      console.error('[FeedbackAuditService] Error getting audit trail:', error);
      throw error;
    }
  }

  /**
   * Get all audit entries for a maid's feedback
   */
  async getMaidFeedbackAudit(maidId, options = {}) {
    try {
      const {
        startDate = null,
        endDate = null,
        action = null,
        limit = 100,
        offset = 0
      } = options;

      const where = {
        feedback: {
          booking: {
            maidId
          }
        }
      };

      if (startDate || endDate) {
        where.createdAt = {};
        if (startDate) where.createdAt.gte = new Date(startDate);
        if (endDate) where.createdAt.lte = new Date(endDate);
      }

      if (action) {
        where.action = action;
      }

      const auditEntries = await getPrismaClient().feedbackAudit.findMany({
        where,
        include: {
          admin: {
            select: {
              id: true,
              name: true,
              email: true
            }
          },
          feedback: {
            select: {
              id: true,
              overallRating: true,
              status: true,
              weight: true
            }
          }
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset
      });

      const totalCount = await getPrismaClient().feedbackAudit.count({ where });

      return {
        entries: auditEntries,
        total: totalCount,
        count: auditEntries.length
      };
    } catch (error) {
      console.error('[FeedbackAuditService] Error getting maid feedback audit:', error);
      throw error;
    }
  }

  /**
   * Get audit summary for reporting
   */
  async getAuditSummary(filters = {}) {
    try {
      const {
        startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Last 30 days
        endDate = new Date(),
        action = null
      } = filters;

      const where = {
        createdAt: {
          gte: startDate,
          lte: endDate
        }
      };

      if (action) {
        where.action = action;
      }

      // Count by action type
      const actionCounts = await getPrismaClient().feedbackAudit.groupBy({
        by: ['action'],
        where,
        _count: true
      });

      // Total audit entries
      const totalAudits = await getPrismaClient().feedbackAudit.count({ where });

      // Most active admins
      const adminActivity = await getPrismaClient().feedbackAudit.groupBy({
        by: ['adminId'],
        where,
        _count: true,
        orderBy: {
          _count: {
            adminId: 'desc'
          }
        },
        take: 10
      });

      // Fetch admin details
      const adminDetails = await Promise.all(
        adminActivity.map(async (admin) => {
          const user = await getPrismaClient().user.findUnique({
            where: { id: admin.adminId },
            select: {
              id: true,
              name: true,
              email: true
            }
          });
          return {
            admin: user,
            actionCount: admin._count
          };
        })
      );

      return {
        period: { startDate, endDate },
        totalAudits,
        actionCounts,
        topAdmins: adminDetails
      };
    } catch (error) {
      console.error('[FeedbackAuditService] Error getting audit summary:', error);
      throw error;
    }
  }
}

module.exports = new FeedbackAuditService();
