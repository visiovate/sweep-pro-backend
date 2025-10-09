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
    this.checkBufferConflict = this.checkBufferConflict.bind(this);
    this.getCurrentBufferStatus = this.getCurrentBufferStatus.bind(this);
    this.cleanupMalformedNotes = this.cleanupMalformedNotes.bind(this);
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
        adminNotes,
        req.user
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
        // Pending requests (ACTIVE status with PENDING_APPROVAL but not APPROVED/REJECTED)
        req.prisma.bufferPeriod.count({
          where: { 
            status: 'ACTIVE',
            AND: [
              {
                notes: {
                  contains: 'STATUS: PENDING_APPROVAL'
                }
              },
              {
                notes: {
                  not: {
                    contains: 'STATUS: APPROVED'
                  }
                }
              },
              {
                notes: {
                  not: {
                    contains: 'STATUS: REJECTED'
                  }
                }
              }
            ]
          }
        }),

        // Active buffer periods (ACTIVE status with APPROVED status)
        req.prisma.bufferPeriod.count({
          where: { 
            status: 'ACTIVE',
            notes: {
              contains: 'STATUS: APPROVED'
            }
          }
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

  /**
   * Check if a date conflicts with buffer periods (customer)
   */
  async checkBufferConflict(req, res) {
    try {
      const { subscriptionId } = req.params;
      const { date } = req.query;

      if (!date) {
        return res.status(400).json({
          success: false,
          message: 'Date parameter is required'
        });
      }

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

      const checkDate = new Date(date);
      const checkDateOnly = new Date(checkDate.getFullYear(), checkDate.getMonth(), checkDate.getDate());
      
      console.log(`🔍 Buffer conflict check for date: ${date} (${checkDateOnly.toISOString()})`);
      
      // Check if the date falls within any active buffer period
      const bufferConflict = await req.prisma.bufferPeriod.findFirst({
        where: {
          subscriptionId,
          status: 'ACTIVE',
          startDate: { lte: checkDateOnly },
          endDate: { gte: checkDateOnly }
        }
      });
      
      if (bufferConflict) {
        console.log(`❌ Buffer conflict found: ${bufferConflict.startDate} to ${bufferConflict.endDate}`);
      } else {
        console.log(`✅ No buffer conflict for date: ${date}`);
      }

      res.json({
        success: true,
        data: {
          hasConflict: !!bufferConflict,
          bufferPeriod: bufferConflict || null,
          date: date
        }
      });

    } catch (error) {
      console.error('Check buffer conflict error:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Check current buffer period status (customer)
   */
  async getCurrentBufferStatus(req, res) {
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

      // Get current active buffer period - check multiple conditions
      const today = new Date();
      
      console.log('🔍 Checking buffer status for subscription:', subscriptionId);
      console.log('🔍 Today:', today.toISOString());
      console.log('🔍 Subscription buffer status:', {
        isInBufferPeriod: subscription.isInBufferPeriod,
        bufferStartDate: subscription.bufferStartDate,
        bufferEndDate: subscription.bufferEndDate
      });

      // Create date-only version of today for proper comparison
      const todayDateOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      const todayEndOfDay = new Date(todayDateOnly);
      todayEndOfDay.setHours(23, 59, 59, 999);

      // First try to find approved buffer periods
      let activeBufferPeriod = await req.prisma.bufferPeriod.findFirst({
        where: {
          subscriptionId,
          status: 'ACTIVE',
          notes: {
            contains: 'STATUS: APPROVED'
          },
          startDate: { lte: todayEndOfDay },
          endDate: { gte: todayDateOnly }
        }
      });

      console.log('🔍 Found approved buffer period:', activeBufferPeriod);

      // If no approved buffer period found, check if subscription says it's in buffer period
      if (!activeBufferPeriod && subscription.isInBufferPeriod) {
        console.log('🔍 Subscription says in buffer period, looking for any active buffer period...');
        
        // Look for any active buffer period for this subscription
        activeBufferPeriod = await req.prisma.bufferPeriod.findFirst({
          where: {
            subscriptionId,
            status: 'ACTIVE',
            startDate: { lte: todayEndOfDay },
            endDate: { gte: todayDateOnly }
          }
        });
        
        console.log('🔍 Found any active buffer period:', activeBufferPeriod);
      }

      // If still no buffer period found but subscription says it's in buffer, use subscription data
      if (!activeBufferPeriod && subscription.isInBufferPeriod && subscription.bufferStartDate && subscription.bufferEndDate) {
        const bufferStart = new Date(subscription.bufferStartDate);
        const bufferEnd = new Date(subscription.bufferEndDate);
        
        // Compare dates only (ignore time) to handle timezone issues
        const todayDateOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        const bufferStartDateOnly = new Date(bufferStart.getFullYear(), bufferStart.getMonth(), bufferStart.getDate());
        const bufferEndDateOnly = new Date(bufferEnd.getFullYear(), bufferEnd.getMonth(), bufferEnd.getDate());
        
        const isInDateRange = todayDateOnly >= bufferStartDateOnly && todayDateOnly <= bufferEndDateOnly;
        
        console.log('🔍 Checking subscription buffer dates (date-only comparison):', {
          today: todayDateOnly.toDateString(),
          bufferStart: bufferStartDateOnly.toDateString(),
          bufferEnd: bufferEndDateOnly.toDateString(),
          todayInRange: isInDateRange,
          originalBufferStart: bufferStart.toISOString(),
          originalBufferEnd: bufferEnd.toISOString()
        });
        
        if (isInDateRange) {
          // Create a virtual buffer period object from subscription data
          activeBufferPeriod = {
            id: 'subscription-buffer',
            subscriptionId: subscriptionId,
            startDate: subscription.bufferStartDate,
            endDate: subscription.bufferEndDate,
            status: 'ACTIVE',
            notes: 'Active buffer period from subscription'
          };
          
          console.log('🔍 Using subscription buffer data as active period');
        }
      }

      console.log('🔍 Final active buffer period:', activeBufferPeriod);

      res.json({
        success: true,
        data: {
          isInBufferPeriod: !!activeBufferPeriod,
          activeBufferPeriod: activeBufferPeriod || null,
          subscriptionBufferStatus: {
            isInBufferPeriod: subscription.isInBufferPeriod,
            bufferStartDate: subscription.bufferStartDate,
            bufferEndDate: subscription.bufferEndDate
          }
        }
      });

    } catch (error) {
      console.error('Get current buffer status error:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Clean up malformed buffer notes (admin utility)
   */
  async cleanupMalformedNotes(req, res) {
    try {
      const result = await this.bufferService.cleanupMalformedBufferNotes();
      res.json(result);
    } catch (error) {
      console.error('Cleanup malformed notes error:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }
}

module.exports = new BufferController();
