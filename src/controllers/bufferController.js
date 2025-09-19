const BufferDayService = require('../services/BufferDayService');
const { validationResult } = require('express-validator');

class BufferController {
  constructor() {
    this.bufferService = new BufferDayService();
    
    // Bind all methods to preserve 'this' context in Express routes
    this.getRemainingBufferDays = this.getRemainingBufferDays.bind(this);
    this.requestBufferDays = this.requestBufferDays.bind(this);
    this.getCustomerBufferHistory = this.getCustomerBufferHistory.bind(this);
    this.getPendingBufferRequests = this.getPendingBufferRequests.bind(this);
    this.approveBufferRequest = this.approveBufferRequest.bind(this);
    this.rejectBufferRequest = this.rejectBufferRequest.bind(this);
    this.getAllBufferPeriods = this.getAllBufferPeriods.bind(this);
    this.getBufferStatistics = this.getBufferStatistics.bind(this);
    this.getAffectedServices = this.getAffectedServices.bind(this);
  }

  /**
   * Get customer's remaining buffer days
   */
  async getRemainingBufferDays(req, res) {
    try {
      const { subscriptionId } = req.params;
      
      // Verify subscription belongs to customer
      const subscription = await req.prisma.subscription.findFirst({
        where: {
          id: subscriptionId,
          customer: {
            userId: req.user.id
          }
        }
      });

      if (!subscription) {
        return res.status(404).json({
          success: false,
          message: 'Subscription not found'
        });
      }

      const bufferInfo = await this.bufferService.getRemainingBufferDays(subscriptionId);
      
      res.json({
        success: true,
        data: bufferInfo
      });

    } catch (error) {
      console.error('Get remaining buffer days error:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Request buffer days (customer)
   */
  async requestBufferDays(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array()
        });
      }

      const { subscriptionId } = req.params;
      const { daysCount, startDate, reason, notes } = req.body;

      // Verify subscription belongs to customer
      const subscription = await req.prisma.subscription.findFirst({
        where: {
          id: subscriptionId,
          customer: {
            userId: req.user.id
          }
        }
      });

      if (!subscription) {
        return res.status(404).json({
          success: false,
          message: 'Subscription not found'
        });
      }

      const result = await this.bufferService.requestBufferDays(
        subscriptionId,
        parseInt(daysCount),
        startDate,
        reason,
        notes
      );

      res.json(result);

    } catch (error) {
      console.error('Request buffer days error:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Get customer's buffer history
   */
  async getCustomerBufferHistory(req, res) {
    try {
      const { subscriptionId } = req.params;
      const { page = 1, limit = 10 } = req.query;

      // Verify subscription belongs to customer
      const subscription = await req.prisma.subscription.findFirst({
        where: {
          id: subscriptionId,
          customer: {
            userId: req.user.id
          }
        }
      });

      if (!subscription) {
        return res.status(404).json({
          success: false,
          message: 'Subscription not found'
        });
      }

      const result = await this.bufferService.getCustomerBufferHistory(
        subscriptionId,
        parseInt(page),
        parseInt(limit)
      );

      res.json({
        success: true,
        data: result
      });

    } catch (error) {
      console.error('Get buffer history error:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Get pending buffer requests (admin)
   */
  async getPendingBufferRequests(req, res) {
    try {
      const { page = 1, limit = 20 } = req.query;

      const result = await this.bufferService.getPendingBufferRequests(
        parseInt(page),
        parseInt(limit)
      );

      res.json({
        success: true,
        data: result
      });

    } catch (error) {
      console.error('Get pending buffer requests error:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Approve buffer request (admin)
   */
  async approveBufferRequest(req, res) {
    try {
      const { bufferPeriodId } = req.params;
      const { adminNotes } = req.body;

      const result = await this.bufferService.approveBufferRequest(
        bufferPeriodId,
        req.user.id,
        adminNotes
      );

      res.json(result);

    } catch (error) {
      console.error('Approve buffer request error:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Reject buffer request (admin)
   */
  async rejectBufferRequest(req, res) {
    try {
      const { bufferPeriodId } = req.params;
      const { rejectionReason } = req.body;

      if (!rejectionReason) {
        return res.status(400).json({
          success: false,
          message: 'Rejection reason is required'
        });
      }

      const result = await this.bufferService.rejectBufferRequest(
        bufferPeriodId,
        req.user.id,
        rejectionReason
      );

      res.json(result);

    } catch (error) {
      console.error('Reject buffer request error:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Get all buffer periods (admin)
   */
  async getAllBufferPeriods(req, res) {
    try {
      const { page = 1, limit = 20, status, customerId } = req.query;
      const offset = (page - 1) * limit;

      const where = {};
      if (status) where.status = status;
      if (customerId) {
        where.subscription = {
          customer: {
            userId: customerId
          }
        };
      }

      const bufferPeriods = await req.prisma.bufferPeriod.findMany({
        where,
        include: {
          subscription: {
            include: {
              customer: {
                include: { user: true }
              },
              plan: {
                include: { service: true }
              }
            }
          }
        },
        orderBy: {
          createdAt: 'desc'
        },
        skip: offset,
        take: parseInt(limit)
      });

      const totalCount = await req.prisma.bufferPeriod.count({ where });

      res.json({
        success: true,
        data: {
          bufferPeriods,
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            totalCount,
            totalPages: Math.ceil(totalCount / limit)
          }
        }
      });

    } catch (error) {
      console.error('Get all buffer periods error:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Get buffer statistics for admin dashboard
   */
  async getBufferStatistics(req, res) {
    try {
      const today = new Date();
      const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
      const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);

      // Get statistics
      const [
        pendingRequests,
        activeBuffers,
        thisMonthRequests,
        totalBufferDaysUsed,
        mostBufferUsageCustomer
      ] = await Promise.all([
        // Active requests count (treating as pending since PENDING doesn't exist)
        req.prisma.bufferPeriod.count({
          where: { status: 'ACTIVE' }
        }),

        // Active buffer periods
        req.prisma.bufferPeriod.count({
          where: { status: 'ACTIVE' }
        }),

        // Buffer requests this month
        req.prisma.bufferPeriod.count({
          where: {
            createdAt: {
              gte: startOfMonth,
              lte: endOfMonth
            }
          }
        }),

        // Total buffer days used this month
        req.prisma.bufferPeriod.aggregate({
          where: {
            status: { in: ['ACTIVE', 'COMPLETED'] },
            startDate: {
              gte: startOfMonth,
              lte: endOfMonth
            }
          },
          _sum: {
            daysCount: true
          }
        }),

        // Customer with most buffer usage
        req.prisma.subscription.findFirst({
          orderBy: {
            bufferDaysUsed: 'desc'
          },
          include: {
            customer: {
              include: { user: true }
            },
            plan: true
          }
        })
      ]);

      res.json({
        success: true,
        data: {
          pendingRequests,
          activeBuffers,
          thisMonthRequests,
          totalBufferDaysUsed: totalBufferDaysUsed._sum.daysCount || 0,
          mostBufferUsage: mostBufferUsageCustomer ? {
            customerName: mostBufferUsageCustomer.customer.user.name,
            planName: mostBufferUsageCustomer.plan.name,
            bufferDaysUsed: mostBufferUsageCustomer.bufferDaysUsed,
            bufferDaysTotal: mostBufferUsageCustomer.bufferDaysCount
          } : null
        }
      });

    } catch (error) {
      console.error('Get buffer statistics error:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Get services affected by buffer periods (admin)
   */
  async getAffectedServices(req, res) {
    try {
      const { date } = req.query;
      const targetDate = date ? new Date(date) : new Date();
      
      const startOfDay = new Date(targetDate.setHours(0, 0, 0, 0));
      const endOfDay = new Date(targetDate.setHours(23, 59, 59, 999));

      // Find services scheduled for the date that are affected by buffer periods
      const affectedServices = await req.prisma.booking.findMany({
        where: {
          scheduledAt: {
            gte: startOfDay,
            lte: endOfDay
          },
          isBufferSkipped: true,
          status: 'CANCELLED'
        },
        include: {
          customer: {
            include: {
              customerProfile: {
                include: {
                  subscription: {
                    include: {
                      plan: true
                    }
                  }
                }
              }
            }
          },
          service: true,
          maid: true
        }
      });

      // Get active buffer periods for the date
      const activeBuffers = await req.prisma.bufferPeriod.findMany({
        where: {
          status: 'ACTIVE',
          startDate: {
            lte: endOfDay
          },
          endDate: {
            gte: startOfDay
          }
        },
        include: {
          subscription: {
            include: {
              customer: {
                include: { user: true }
              },
              plan: true
            }
          }
        }
      });

      res.json({
        success: true,
        data: {
          affectedServices,
          activeBuffers,
          date: targetDate.toISOString().split('T')[0],
          summary: {
            totalAffectedServices: affectedServices.length,
            totalActiveBuffers: activeBuffers.length,
            customersInBuffer: activeBuffers.map(b => ({
              name: b.subscription.customer.user.name,
              email: b.subscription.customer.user.email,
              plan: b.subscription.plan.name,
              bufferDays: b.daysCount
            }))
          }
        }
      });

    } catch (error) {
      console.error('Get affected services error:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }
}

module.exports = new BufferController();
