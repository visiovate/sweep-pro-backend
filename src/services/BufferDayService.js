const { PrismaClient } = require('@prisma/client');

class BufferDayService {
  constructor() {
    this.prisma = new PrismaClient();
    
    // Buffer day allocation rules
    this.bufferAllocationRules = {
      // 1 month subscription: 3 buffer days
      1: { bufferDays: 3, period: 'monthly' },
      
      // 3 month subscription: 7 buffer days (distributed over 3 months)
      3: { bufferDays: 7, period: 'quarterly' },
      
      // 6 month subscription: 12 buffer days (2 per month)
      6: { bufferDays: 12, period: 'half-yearly' },
      
      // 12 month subscription: 20 buffer days (distributed over year)
      12: { bufferDays: 20, period: 'yearly' }
    };
  }

  /**
   * Calculate buffer days for a subscription plan
   */
  calculateBufferDaysForPlan(durationInMonths) {
    const rule = this.bufferAllocationRules[durationInMonths];
    
    if (rule) {
      return rule.bufferDays;
    }

    // For custom durations, calculate proportionally
    if (durationInMonths <= 1) {
      return 3; // Minimum 3 days for any plan
    } else if (durationInMonths <= 3) {
      return Math.floor(durationInMonths * 2.33); // ~7 days for 3 months
    } else if (durationInMonths <= 6) {
      return Math.floor(durationInMonths * 2); // 2 per month for 6 months
    } else {
      return Math.floor(durationInMonths * 1.67); // ~20 days for 12 months
    }
  }

  /**
   * Get remaining buffer days for a subscription
   */
  async getRemainingBufferDays(subscriptionId) {
    const subscription = await this.prisma.subscription.findUnique({
      where: { id: subscriptionId },
      select: {
        bufferDaysCount: true,
        bufferDaysUsed: true,
        startDate: true,
        endDate: true,
        plan: {
          select: {
            duration: true
          }
        }
      }
    });

    if (!subscription) {
      throw new Error('Subscription not found');
    }

    return {
      total: subscription.bufferDaysCount,
      used: subscription.bufferDaysUsed,
      remaining: subscription.bufferDaysCount - subscription.bufferDaysUsed,
      resetDate: this.getNextResetDate(subscription)
    };
  }

  /**
   * Get next buffer day reset date
   */
  getNextResetDate(subscription) {
    const now = new Date();
    const subscriptionStart = new Date(subscription.startDate);
    const planDuration = subscription.plan.duration;

    // Calculate months elapsed since subscription start
    const monthsElapsed = Math.floor((now - subscriptionStart) / (1000 * 60 * 60 * 24 * 30));
    
    // For monthly plans, reset every month
    if (planDuration === 1) {
      const nextReset = new Date(subscriptionStart);
      nextReset.setMonth(nextReset.getMonth() + monthsElapsed + 1);
      return nextReset;
    }

    // For longer plans, reset based on plan duration
    const nextReset = new Date(subscriptionStart);
    nextReset.setMonth(nextReset.getMonth() + planDuration);
    return nextReset;
  }

  /**
   * Check if customer can request buffer days
   */
  async canRequestBufferDays(subscriptionId, requestedDays) {
    const bufferInfo = await this.getRemainingBufferDays(subscriptionId);
    
    if (bufferInfo.remaining < requestedDays) {
      return {
        allowed: false,
        reason: `Not enough buffer days. You have ${bufferInfo.remaining} remaining out of ${bufferInfo.total}.`,
        remaining: bufferInfo.remaining
      };
    }

    // Check if customer is already in buffer period
    const activeBuffer = await this.prisma.bufferPeriod.findFirst({
      where: {
        subscriptionId,
        status: 'ACTIVE'
      }
    });

    if (activeBuffer) {
      return {
        allowed: false,
        reason: 'You already have an active buffer period.',
        activeBuffer
      };
    }

    return {
      allowed: true,
      remaining: bufferInfo.remaining
    };
  }

  /**
   * Request buffer days (customer pause)
   */
  async requestBufferDays(subscriptionId, daysCount, startDate, reason = 'Personal reason', notes = '') {
    try {
      // Validate request
      const canRequest = await this.canRequestBufferDays(subscriptionId, daysCount);
      if (!canRequest.allowed) {
        throw new Error(canRequest.reason);
      }

      const subscription = await this.prisma.subscription.findUnique({
        where: { id: subscriptionId },
        include: {
          customer: {
            include: { user: true }
          }
        }
      });

      // Parse start date
      const bufferStartDate = new Date(startDate);
      const today = new Date();
      const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      
      // Ensure start date is not in the past (allow same day)
      if (bufferStartDate < todayMidnight) {
        const todayStr = today.toISOString().split('T')[0];
        throw new Error(`Buffer period cannot start in the past. Today is ${todayStr}. Please choose a date from today onwards.`);
      }

      const bufferEndDate = new Date(bufferStartDate);
      bufferEndDate.setDate(bufferEndDate.getDate() + daysCount - 1); // Include start day

      // Create buffer period request
      const bufferPeriod = await this.prisma.bufferPeriod.create({
        data: {
          subscriptionId,
          startDate: bufferStartDate,
          endDate: bufferEndDate,
          status: 'ACTIVE', // Using ACTIVE as default since PENDING doesn't exist in enum
          reason: 'CUSTOMER_REQUEST',
          daysCount,
          servicesSkipped: 0,
          autoResumeDate: new Date(bufferEndDate.getTime() + 24 * 60 * 60 * 1000), // Resume next day
          isAutomatic: false,
          notes: `Customer request: ${reason}. ${notes}`
        }
      });

      // Update subscription to reserve buffer days
      await this.prisma.subscription.update({
        where: { id: subscriptionId },
        data: {
          bufferDaysUsed: subscription.bufferDaysUsed + daysCount
        }
      });

      // Create admin notification
      await this.createBufferRequestNotification(subscription, bufferPeriod, reason);

      console.log(`🛡️ Buffer period requested by ${subscription.customer.user.email}`);
      
      return {
        success: true,
        data: {
          bufferPeriod
        },
        message: 'Buffer period activated successfully. Your services will be paused during this period.'
      };

    } catch (error) {
      console.error('❌ Error requesting buffer days:', error);
      throw error;
    }
  }

  /**
   * Admin approve buffer period request
   */
  async approveBufferRequest(bufferPeriodId, adminId, adminNotes = '') {
    try {
      const bufferPeriod = await this.prisma.bufferPeriod.findUnique({
        where: { id: bufferPeriodId },
        include: {
          subscription: {
            include: {
              customer: {
                include: { user: true }
              }
            }
          }
        }
      });

      if (!bufferPeriod) {
        throw new Error('Buffer period request not found');
      }

      if (bufferPeriod.status !== 'ACTIVE') {
        throw new Error('Buffer period request is not in active status for approval');
      }

      // Activate buffer period
      await this.prisma.bufferPeriod.update({
        where: { id: bufferPeriodId },
        data: {
          status: 'ACTIVE',
          notes: `${bufferPeriod.notes}\\nAdmin approved: ${adminNotes}`
        }
      });

      // Update subscription
      await this.prisma.subscription.update({
        where: { id: bufferPeriod.subscriptionId },
        data: {
          isInBufferPeriod: true,
          bufferStartDate: bufferPeriod.startDate,
          bufferEndDate: bufferPeriod.endDate
        }
      });

      // Cancel services in buffer period
      await this.cancelServicesInBufferPeriod(
        bufferPeriod.subscriptionId,
        bufferPeriod.startDate,
        bufferPeriod.endDate
      );

      // Notify customer about approval
      await this.prisma.notification.create({
        data: {
          userId: bufferPeriod.subscription.customer.user.id,
          type: 'BUFFER_APPROVED',
          title: 'Buffer Period Approved',
          message: `Your buffer period request has been approved. Services will be paused from ${bufferPeriod.startDate.toDateString()} to ${bufferPeriod.endDate.toDateString()}.`,
          data: {
            bufferPeriodId,
            startDate: bufferPeriod.startDate,
            endDate: bufferPeriod.endDate,
            daysCount: bufferPeriod.daysCount
          }
        }
      });

      console.log(`✅ Buffer period approved for ${bufferPeriod.subscription.customer.user.email}`);
      
      return {
        success: true,
        message: 'Buffer period approved and activated'
      };

    } catch (error) {
      console.error('❌ Error approving buffer request:', error);
      throw error;
    }
  }

  /**
   * Admin reject buffer period request
   */
  async rejectBufferRequest(bufferPeriodId, adminId, rejectionReason) {
    try {
      const bufferPeriod = await this.prisma.bufferPeriod.findUnique({
        where: { id: bufferPeriodId },
        include: {
          subscription: {
            include: {
              customer: {
                include: { user: true }
              }
            }
          }
        }
      });

      if (!bufferPeriod) {
        throw new Error('Buffer period request not found');
      }

      // Reject buffer period
      await this.prisma.bufferPeriod.update({
        where: { id: bufferPeriodId },
        data: {
          status: 'CANCELLED',
          notes: `${bufferPeriod.notes}\\nAdmin rejected: ${rejectionReason}`
        }
      });

      // Restore buffer days to customer
      await this.prisma.subscription.update({
        where: { id: bufferPeriod.subscriptionId },
        data: {
          bufferDaysUsed: bufferPeriod.subscription.bufferDaysUsed - bufferPeriod.daysCount
        }
      });

      // Notify customer about rejection
      await this.prisma.notification.create({
        data: {
          userId: bufferPeriod.subscription.customer.user.id,
          type: 'BUFFER_REJECTED',
          title: 'Buffer Period Request Rejected',
          message: `Your buffer period request has been rejected. Reason: ${rejectionReason}`,
          data: {
            bufferPeriodId,
            rejectionReason
          }
        }
      });

      console.log(`❌ Buffer period rejected for ${bufferPeriod.subscription.customer.user.email}`);
      
      return {
        success: true,
        message: 'Buffer period request rejected'
      };

    } catch (error) {
      console.error('❌ Error rejecting buffer request:', error);
      throw error;
    }
  }

  /**
   * Get pending buffer requests for admin
   */
  async getPendingBufferRequests(page = 1, limit = 20) {
    const offset = (page - 1) * limit;

    const requests = await this.prisma.bufferPeriod.findMany({
      where: {
        status: 'ACTIVE'
      },
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
      take: limit
    });

    const totalCount = await this.prisma.bufferPeriod.count({
      where: { status: 'ACTIVE' }
    });

    return {
      requests,
      pagination: {
        page,
        limit,
        totalCount,
        totalPages: Math.ceil(totalCount / limit)
      }
    };
  }

  /**
   * Create admin notification for buffer request
   */
  async createBufferRequestNotification(subscription, bufferPeriod, reason) {
    // Get all admin users
    const adminUsers = await this.prisma.user.findMany({
      where: { role: 'ADMIN' }
    });

    // Create notification for each admin
    for (const admin of adminUsers) {
      await this.prisma.notification.create({
        data: {
          userId: admin.id,
          type: 'BUFFER_REQUEST',
          title: 'New Buffer Period Request',
          message: `${subscription.customer.user.name} has requested a ${bufferPeriod.daysCount}-day buffer period starting ${bufferPeriod.startDate.toDateString()}. Reason: ${reason}`,
          data: {
            bufferPeriodId: bufferPeriod.id,
            customerId: subscription.customer.user.id,
            customerName: subscription.customer.user.name,
            customerEmail: subscription.customer.user.email,
            subscriptionId: subscription.id,
            planName: subscription.plan?.name,
            startDate: bufferPeriod.startDate,
            endDate: bufferPeriod.endDate,
            daysCount: bufferPeriod.daysCount,
            reason
          }
        }
      });
    }
  }

  /**
   * Cancel services in buffer period
   */
  async cancelServicesInBufferPeriod(subscriptionId, startDate, endDate) {
    const bookingsToCancel = await this.prisma.booking.findMany({
      where: {
        customer: {
          customerProfile: {
            subscription: {
              id: subscriptionId
            }
          }
        },
        scheduledAt: {
          gte: startDate,
          lte: endDate
        },
        status: {
          in: ['CONFIRMED', 'ASSIGNED', 'PENDING']
        }
      },
      include: {
        maid: true
      }
    });

    let cancelledCount = 0;

    for (const booking of bookingsToCancel) {
      await this.prisma.booking.update({
        where: { id: booking.id },
        data: {
          status: 'CANCELLED',
          isBufferSkipped: true,
          specialInstructions: 'Service cancelled due to approved buffer period'
        }
      });

      // Notify assigned maid about cancellation
      if (booking.maidId) {
        await this.prisma.notification.create({
          data: {
            userId: booking.maidId,
            type: 'SERVICE_CANCELLED',
            title: 'Service Cancelled - Buffer Period',
            message: `Service scheduled for ${booking.scheduledAt.toDateString()} has been cancelled due to customer buffer period.`,
            data: {
              bookingId: booking.id,
              reason: 'Customer buffer period',
              scheduledAt: booking.scheduledAt
            }
          }
        });
      }

      cancelledCount++;
    }

    // Update buffer period with cancelled services count
    await this.prisma.bufferPeriod.updateMany({
      where: {
        subscriptionId,
        startDate,
        endDate,
        status: 'ACTIVE'
      },
      data: {
        servicesSkipped: cancelledCount
      }
    });

    return cancelledCount;
  }

  /**
   * Get customer buffer history
   */
  async getCustomerBufferHistory(subscriptionId, page = 1, limit = 10) {
    const offset = (page - 1) * limit;

    const history = await this.prisma.bufferPeriod.findMany({
      where: {
        subscriptionId
      },
      orderBy: {
        createdAt: 'desc'
      },
      skip: offset,
      take: limit
    });

    const totalCount = await this.prisma.bufferPeriod.count({
      where: { subscriptionId }
    });

    return {
      history,
      pagination: {
        page,
        limit,
        totalCount,
        totalPages: Math.ceil(totalCount / limit)
      }
    };
  }
}

module.exports = BufferDayService;
