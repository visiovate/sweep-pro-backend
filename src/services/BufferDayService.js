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

      // Parse start date and ensure it's date-only (no time component)
      const bufferStartDate = new Date(startDate);
      const bufferStartDateOnly = new Date(bufferStartDate.getFullYear(), bufferStartDate.getMonth(), bufferStartDate.getDate());
      
      const today = new Date();
      const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      
      console.log(`🛡️ Creating buffer period: Start=${startDate} (${bufferStartDateOnly.toISOString()}), Days=${daysCount}`);
      
      // Ensure start date is not in the past (allow same day)
      if (bufferStartDateOnly < todayMidnight) {
        const todayStr = today.toISOString().split('T')[0];
        throw new Error(`Buffer period cannot start in the past. Today is ${todayStr}. Please choose a date from today onwards.`);
      }

      const bufferEndDate = new Date(bufferStartDateOnly);
      bufferEndDate.setDate(bufferEndDate.getDate() + daysCount - 1); // Include start day
      
      console.log(`🛡️ Buffer period dates: ${bufferStartDateOnly.toISOString()} to ${bufferEndDate.toISOString()}`);

      // Create buffer period request (PENDING status for admin approval)
      const bufferPeriod = await this.prisma.bufferPeriod.create({
        data: {
          subscriptionId,
          startDate: bufferStartDateOnly,
          endDate: bufferEndDate,
          status: 'ACTIVE', // Note: Using ACTIVE as PENDING status since PENDING doesn't exist in enum
          reason: 'CUSTOMER_REQUEST',
          daysCount,
          servicesSkipped: 0,
          autoResumeDate: new Date(bufferEndDate.getTime() + 24 * 60 * 60 * 1000), // Resume next day
          isAutomatic: false,
          notes: `Customer request: ${reason}. ${notes}. STATUS: PENDING_APPROVAL`
        }
      });

      // DO NOT update subscription buffer days yet - wait for admin approval
      // Buffer days will be deducted only after admin approval

      // Create admin notification
      await this.createBufferRequestNotification(subscription, bufferPeriod, reason);

      console.log(`🛡️ Buffer period requested by ${subscription.customer.user.email}`);
      
      return {
        success: true,
        data: {
          bufferPeriod
        },
        message: 'Buffer period request submitted successfully. Your request is pending admin approval. You will be notified once approved.'
      };

    } catch (error) {
      console.error('❌ Error requesting buffer days:', error);
      throw error;
    }
  }

  /**
   * Admin approve buffer period request
   */
  async approveBufferRequest(bufferPeriodId, adminId, adminNotes = '', adminUser = null) {
    try {
      console.log(`🔄 Starting approval process for buffer period: ${bufferPeriodId}`);
      
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
        console.error(`❌ Buffer period not found: ${bufferPeriodId}`);
        throw new Error('Buffer period request not found');
      }
      
      console.log(`📋 Found buffer period:`, {
        id: bufferPeriod.id,
        status: bufferPeriod.status,
        notes: bufferPeriod.notes?.substring(0, 100) + '...',
        subscriptionId: bufferPeriod.subscriptionId
      });

      // Idempotency: if already approved, return success (prevents double-click/double-request errors)
      if (bufferPeriod.status === 'ACTIVE' && bufferPeriod.notes?.includes('STATUS: APPROVED')) {
        return {
          success: true,
          message: 'Buffer period already approved and active'
        };
      }

      // Check if this is a pending approval request
      if (bufferPeriod.status !== 'ACTIVE' || !bufferPeriod.notes?.includes('PENDING_APPROVAL')) {
        throw new Error('Buffer period request is not pending approval');
      }

      console.log(`🔄 Step 1: Updating buffer period status...`);
      
      // Activate buffer period and remove PENDING_APPROVAL status
      let updatedNotes = bufferPeriod.notes || '';
      
      // Clean up any existing duplicate admin approval entries
      updatedNotes = updatedNotes.replace(/\nAdmin approved:\s*\n?/g, '');
      updatedNotes = updatedNotes.replace(/\nAdmin approved:\s*$/g, '');
      
      // Remove PENDING_APPROVAL status and replace with APPROVED
      updatedNotes = updatedNotes.replace('STATUS: PENDING_APPROVAL', 'STATUS: APPROVED');
      
      // Add proper admin approval note
      if (adminNotes) {
        const adminName = adminUser?.name || 'Admin';
        const timestamp = new Date().toISOString().split('T')[0]; // Just date, not full timestamp
        updatedNotes += `\nAdmin approved by ${adminName} on ${timestamp}: ${adminNotes}`;
      }
      
      await this.prisma.bufferPeriod.update({
        where: { id: bufferPeriodId },
        data: {
          status: 'ACTIVE',
          notes: updatedNotes
        }
      });
      
      console.log(`✅ Step 1 completed: Buffer period status updated`);
      console.log(`🔄 Step 2: Updating subscription...`);

      // Update subscription - deduct buffer days and set buffer period flags
      await this.prisma.subscription.update({
        where: { id: bufferPeriod.subscriptionId },
        data: {
          isInBufferPeriod: true,
          bufferStartDate: bufferPeriod.startDate,
          bufferEndDate: bufferPeriod.endDate,
          bufferDaysUsed: bufferPeriod.subscription.bufferDaysUsed + bufferPeriod.daysCount
        }
      });
      
      console.log(`✅ Step 2 completed: Subscription updated`);
      console.log(`🔄 Step 3: Cancelling services in buffer period...`);

      // Cancel services in buffer period (with error handling)
      let cancelledCount = 0;
      try {
        cancelledCount = await this.cancelServicesInBufferPeriod(
          bufferPeriod.subscriptionId,
          bufferPeriod.startDate,
          bufferPeriod.endDate
        );
        console.log(`✅ Successfully cancelled ${cancelledCount} bookings during buffer period`);
      } catch (serviceError) {
        console.error('⚠️ Error cancelling services during buffer period:', serviceError);
        // Don't fail the entire approval process if service cancellation fails
        // The buffer period is still approved, but services weren't cancelled
      }
      
      console.log(`✅ Step 3 completed: Service cancellation handled`);
      console.log(`🔄 Step 4: Sending customer notification...`);

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
      
      console.log(`✅ Step 4 completed: Customer notification sent`);
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
   * Clean up malformed buffer request notes (utility function)
   */
  async cleanupMalformedBufferNotes() {
    try {
      console.log('🧹 Starting cleanup of malformed buffer notes...');
      
      // Find all buffer periods with malformed notes
      const malformedRequests = await this.prisma.bufferPeriod.findMany({
        where: {
          status: 'ACTIVE',
          notes: {
            contains: 'Admin approved: \n'
          }
        }
      });

      console.log(`🧹 Found ${malformedRequests.length} requests with malformed notes`);

      for (const request of malformedRequests) {
        let cleanedNotes = request.notes || '';
        
        // Remove duplicate empty admin approval entries
        cleanedNotes = cleanedNotes.replace(/\nAdmin approved:\s*\n?/g, '');
        cleanedNotes = cleanedNotes.replace(/\nAdmin approved:\s*$/g, '');
        
        // If it still has PENDING_APPROVAL but no proper approval, mark as approved
        if (cleanedNotes.includes('STATUS: PENDING_APPROVAL') && !cleanedNotes.includes('STATUS: APPROVED')) {
          cleanedNotes = cleanedNotes.replace('STATUS: PENDING_APPROVAL', 'STATUS: APPROVED');
          cleanedNotes += '\nAdmin approved by System Cleanup on ' + new Date().toISOString().split('T')[0] + ': Cleaned up malformed request';
        }

        await this.prisma.bufferPeriod.update({
          where: { id: request.id },
          data: { notes: cleanedNotes }
        });
      }

      console.log(`🧹 Cleaned up ${malformedRequests.length} malformed buffer requests`);
      
      return {
        success: true,
        message: `Cleaned up ${malformedRequests.length} malformed buffer requests`,
        cleanedCount: malformedRequests.length
      };

    } catch (error) {
      console.error('❌ Error cleaning up malformed buffer notes:', error);
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

      // Check if this is a pending approval request
      if (bufferPeriod.status !== 'ACTIVE' || !bufferPeriod.notes?.includes('PENDING_APPROVAL')) {
        throw new Error('Buffer period request is not pending approval');
      }

      // Reject buffer period and update notes
      const updatedNotes = bufferPeriod.notes
        .replace('STATUS: PENDING_APPROVAL', 'STATUS: REJECTED')
        + `\nAdmin rejected: ${rejectionReason}`;
      
      await this.prisma.bufferPeriod.update({
        where: { id: bufferPeriodId },
        data: {
          status: 'CANCELLED',
          notes: updatedNotes
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
   * Cancel services within buffer period dates
   */
  async cancelServicesInBufferPeriod(subscriptionId, startDate, endDate) {
    try {
      console.log(`🚫 Starting service cancellation for subscription ${subscriptionId} from ${startDate} to ${endDate}`);

      // Ensure we're using date-only comparisons for buffer period
      const bufferStartDate = new Date(startDate);
      const bufferEndDate = new Date(endDate);
      
      // Set time to cover the entire day range
      const startOfBufferPeriod = new Date(bufferStartDate.getFullYear(), bufferStartDate.getMonth(), bufferStartDate.getDate(), 0, 0, 0);
      const endOfBufferPeriod = new Date(bufferEndDate.getFullYear(), bufferEndDate.getMonth(), bufferEndDate.getDate(), 23, 59, 59);

      console.log(`🚫 Searching for bookings between ${startOfBufferPeriod.toISOString()} and ${endOfBufferPeriod.toISOString()}`);

    // Find all bookings within the buffer period
    console.log(`🔍 Executing booking query with subscription ID: ${subscriptionId}`);
    
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
          gte: startOfBufferPeriod,
          lte: endOfBufferPeriod
        },
        status: {
          in: ['CONFIRMED', 'ASSIGNED', 'PENDING']
        }
      },
      include: {
        maid: true,
        customer: {
          include: {
            customerProfile: {
              include: {
                subscription: true
              }
            }
          }
        }
      }
    });
    
    console.log(`🔍 Query executed successfully, found ${bookingsToCancel.length} bookings`);

    console.log(`🚫 Found ${bookingsToCancel.length} bookings to cancel during buffer period`);

    let cancelledCount = 0;

    for (const booking of bookingsToCancel) {
      await this.prisma.booking.update({
        where: { id: booking.id },
        data: {
          status: 'CANCELLED',
          isBufferSkipped: true,
          specialInstructions: `${booking.specialInstructions || ''}\nCancelled due to approved buffer period`
        }
      });

      // Notify customer about cancellation
      await this.prisma.notification.create({
        data: {
          userId: booking.customer.id,
          type: 'SERVICE_CANCELLED',
          title: 'Service Cancelled - Buffer Period',
          message: `Your service scheduled for ${booking.scheduledAt.toDateString()} has been cancelled due to your approved buffer period.`,
          data: {
            bookingId: booking.id,
            reason: 'Buffer period approved',
            scheduledAt: booking.scheduledAt
          }
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

    console.log(`🚫 Cancelled ${cancelledCount} bookings during buffer period`);

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
    
    } catch (error) {
      console.error('❌ Error in cancelServicesInBufferPeriod:', error);
      throw error;
    }
  }

  /**
   * Automatically end expired buffer periods and resume services
   */
  async processExpiredBufferPeriods() {
    try {
      const today = new Date();
      today.setHours(23, 59, 59, 999); // End of today

      // Find all active buffer periods that have ended
      const expiredBufferPeriods = await this.prisma.bufferPeriod.findMany({
        where: {
          status: 'ACTIVE',
          endDate: { lt: today }
        },
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

      console.log(`🔄 Processing ${expiredBufferPeriods.length} expired buffer periods`);

      for (const bufferPeriod of expiredBufferPeriods) {
        // Mark buffer period as completed
        await this.prisma.bufferPeriod.update({
          where: { id: bufferPeriod.id },
          data: {
            status: 'COMPLETED',
            notes: `${bufferPeriod.notes}\\nAutomatically completed on ${today.toISOString()}`
          }
        });

        // Resume subscription services
        await this.prisma.subscription.update({
          where: { id: bufferPeriod.subscriptionId },
          data: {
            isInBufferPeriod: false,
            bufferStartDate: null,
            bufferEndDate: null
          }
        });

        // Notify customer about buffer period completion
        await this.prisma.notification.create({
          data: {
            userId: bufferPeriod.subscription.customer.user.id,
            type: 'BUFFER_ENDED',
            title: 'Buffer Period Completed',
            message: `Your buffer period has ended. Your cleaning services have been automatically resumed. You can now book new services.`,
            data: {
              bufferPeriodId: bufferPeriod.id,
              endDate: bufferPeriod.endDate,
              daysCount: bufferPeriod.daysCount
            }
          }
        });

        console.log(`✅ Buffer period completed for ${bufferPeriod.subscription.customer.user.email}`);
      }

      return {
        success: true,
        processedCount: expiredBufferPeriods.length,
        message: `Processed ${expiredBufferPeriods.length} expired buffer periods`
      };

    } catch (error) {
      console.error('❌ Error processing expired buffer periods:', error);
      throw error;
    }
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
