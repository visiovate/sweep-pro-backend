const { getPrismaClient } = require('../utils/database');

const prisma = getPrismaClient();

class AdminAuditLogger {
  /**
   * Log an admin action to the audit log
   * @param {Object} params - Audit log parameters
   * @param {string} params.adminId - Admin user ID
   * @param {string} params.action - Action performed (e.g., 'admin.login.success', 'user.created')
   * @param {string} params.resource - Resource affected (e.g., 'User', 'Booking')
   * @param {boolean} params.success - Whether the action was successful
   * @param {Object} params.changes - Before/after state changes (optional)
   * @param {string} params.errorMessage - Error message if action failed (optional)
   * @param {string} params.ipAddress - Client IP address
   * @param {string} params.userAgent - User agent string
   */
  async log(params) {
    try {
      const {
        adminId,
        action,
        resource,
        success,
        changes = null,
        errorMessage = null,
        ipAddress = null,
        userAgent = null
      } = params;

      // Create audit log entry
      await prisma.adminAuditLog.create({
        data: {
          adminId,
          action,
          resource,
          changes,
          ipAddress,
          userAgent,
          success,
          errorMessage
        }
      });

      // Also log to console for development/debugging
      if (process.env.NODE_ENV !== 'production') {
        console.log(`[AUDIT] ${action} - Admin: ${adminId}, Success: ${success}`);
      }
    } catch (error) {
      // Never fail the main operation if audit logging fails
      console.error('Failed to log admin audit:', error.message);
    }
  }

  /**
   * Get audit logs with filtering
   * @param {Object} filters - Filter parameters
   * @param {string} filters.adminId - Filter by admin ID
   * @param {string} filters.action - Filter by action
   * @param {Date} filters.startDate - Filter by start date
   * @param {Date} filters.endDate - Filter by end date
   * @param {boolean} filters.success - Filter by success status
   * @param {number} filters.limit - Limit results
   * @param {number} filters.offset - Offset for pagination
   */
  async getLogs(filters = {}) {
    try {
      const {
        adminId,
        action,
        startDate,
        endDate,
        success,
        limit = 100,
        offset = 0
      } = filters;

      const where = {};

      if (adminId) {
        where.adminId = adminId;
      }

      if (action) {
        where.action = action;
      }

      if (startDate || endDate) {
        where.createdAt = {};
        if (startDate) {
          where.createdAt.gte = startDate;
        }
        if (endDate) {
          where.createdAt.lte = endDate;
        }
      }

      if (success !== undefined) {
        where.success = success;
      }

      const logs = await prisma.adminAuditLog.findMany({
        where,
        include: {
          admin: {
            select: {
              id: true,
              name: true,
              email: true
            }
          }
        },
        orderBy: {
          createdAt: 'desc'
        },
        take: limit,
        skip: offset
      });

      const total = await prisma.adminAuditLog.count({ where });

      return {
        logs,
        total,
        limit,
        offset
      };
    } catch (error) {
      console.error('Failed to get audit logs:', error);
      throw error;
    }
  }

  /**
   * Get audit log by ID
   * @param {string} id - Audit log ID
   */
  async getLogById(id) {
    try {
      const log = await prisma.adminAuditLog.findUnique({
        where: { id },
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

      return log;
    } catch (error) {
      console.error('Failed to get audit log:', error);
      throw error;
    }
  }
}

// Export singleton instance
const adminAuditLogger = new AdminAuditLogger();

module.exports = { adminAuditLogger, AdminAuditLogger };
