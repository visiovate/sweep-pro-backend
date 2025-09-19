const { PrismaClient } = require('@prisma/client');
const notificationService = require('./notificationService');

const prisma = new PrismaClient();

class SubscriptionBufferService {
  constructor() {
    this.BUFFER_DAYS_DEFAULT = 3;
    this.CYCLE_LENGTH_DAYS = 30;
  }

  /**
   * Initialize a new subscription cycle
   * @param {string} subscriptionId - The subscription ID
   * @param {number} cycleNumber - The cycle number (1-based)
   * @returns {Promise<Object>} The created cycle
   */
  async initializeSubscriptionCycle(subscriptionId, cycleNumber = 1) {
    try {
      const subscription = await prisma.subscription.findUnique({
        where: { id: subscriptionId },
        include: { plan: true }
      });

      if (!subscription) {
        throw new Error('Subscription not found');
      }

      const now = new Date();
      const cycleStart = cycleNumber === 1 ? subscription.startDate : now;
      const cycleEnd = new Date(cycleStart);
      cycleEnd.setDate(cycleEnd.getDate() + this.CYCLE_LENGTH_DAYS);

      // Calculate buffer period (last 3 days of the cycle)
      const bufferStart = new Date(cycleEnd);
      bufferStart.setDate(bufferStart.getDate() - subscription.bufferDaysCount);

      const cycle = await prisma.subscriptionCycle.create({
        data: {
          subscriptionId,
          cycleNumber,
          startDate: cycleStart,
          endDate: cycleEnd,
          status: 'ACTIVE',
          totalServices: subscription.plan.sessionsPerMonth,
          amount: subscription.amount,
          paymentStatus: 'COMPLETED'
        }
      });

      // Update subscription with current cycle info
      await prisma.subscription.update({
        where: { id: subscriptionId },
        data: {
          currentCycleStart: cycleStart,
          currentCycleEnd: cycleEnd,
          totalCycles: { increment: 1 }
        }
      });

      return cycle;
    } catch (error) {
      console.error('Error initializing subscription cycle:', error);
      throw error;
    }
  }

  /**
   * Start buffer period for a subscription
   * @param {string} subscriptionId - The subscription ID
   * @param {string} reason - Reason for buffer period
   * @returns {Promise<Object>} The created buffer period
   */
  async startBufferPeriod(subscriptionId, reason = 'END_OF_MONTH') {
    try {
      const subscription = await prisma.subscription.findUnique({
        where: { id: subscriptionId },
        include: { 
          plan: true,
          customer: { include: { user: true } }
        }
      });

      if (!subscription) {
        throw new Error('Subscription not found');
      }

      if (subscription.isInBufferPeriod) {
        throw new Error('Subscription is already in buffer period');
      }

      const now = new Date();
      const bufferEnd = new Date(now);
      bufferEnd.setDate(bufferEnd.getDate() + subscription.bufferDaysCount);

      // Get current cycle
      const currentCycle = await prisma.subscriptionCycle.findFirst({
        where: {
          subscriptionId,
          status: 'ACTIVE',
          startDate: { lte: now },
          endDate: { gte: now }
        }
      });

      // Create buffer period
      const bufferPeriod = await prisma.bufferPeriod.create({
        data: {
          subscriptionId,
          cycleId: currentCycle?.id,
          startDate: now,
          endDate: bufferEnd,
          autoResumeDate: bufferEnd,
          reason,
          daysCount: subscription.bufferDaysCount,
          status: 'ACTIVE'
        }
      });

      // Update subscription status
      await prisma.subscription.update({
        where: { id: subscriptionId },
        data: {
          isInBufferPeriod: true,
          bufferStartDate: now,
          bufferEndDate: bufferEnd,
          bufferDaysUsed: { increment: subscription.bufferDaysCount }
        }
      });

      // Update current cycle if exists
      if (currentCycle) {
        await prisma.subscriptionCycle.update({
          where: { id: currentCycle.id },
          data: {
            status: 'IN_BUFFER',
            isBufferActive: true,
            bufferStartDate: now,
            bufferEndDate: bufferEnd,
            bufferDaysUsed: { increment: subscription.bufferDaysCount }
          }
        });
      }

      // Cancel any pending bookings during buffer period
      await this.cancelBufferPeriodBookings(subscriptionId, now, bufferEnd);

      // Send notification
      await notificationService.notifyBufferPeriodStarted(subscription, bufferPeriod);

      return bufferPeriod;
    } catch (error) {
      console.error('Error starting buffer period:', error);
      throw error;
    }
  }

  /**
   * End buffer period and resume subscription
   * @param {string} subscriptionId - The subscription ID
   * @returns {Promise<Object>} Updated subscription
   */
  async endBufferPeriod(subscriptionId) {
    try {
      const subscription = await prisma.subscription.findUnique({
        where: { id: subscriptionId },
        include: { 
          plan: true,
          customer: { include: { user: true } }
        }
      });

      if (!subscription) {
        throw new Error('Subscription not found');
      }

      if (!subscription.isInBufferPeriod) {
        throw new Error('Subscription is not in buffer period');
      }

      const now = new Date();

      // Update active buffer period
      await prisma.bufferPeriod.updateMany({
        where: {
          subscriptionId,
          status: 'ACTIVE'
        },
        data: {
          status: 'COMPLETED',
          resumedAt: now
        }
      });

      // Update subscription
      const updatedSubscription = await prisma.subscription.update({
        where: { id: subscriptionId },
        data: {
          isInBufferPeriod: false,
          bufferStartDate: null,
          bufferEndDate: null
        }
      });

      // Update current cycle
      const currentCycle = await prisma.subscriptionCycle.findFirst({
        where: {
          subscriptionId,
          status: 'IN_BUFFER'
        }
      });

      if (currentCycle) {
        await prisma.subscriptionCycle.update({
          where: { id: currentCycle.id },
          data: {
            status: 'ACTIVE',
            isBufferActive: false,
            bufferStartDate: null,
            bufferEndDate: null
          }
        });
      }

      // Schedule next services
      await this.scheduleMonthlyServices(subscriptionId);

      // Send notification
      await notificationService.notifyBufferPeriodEnded(subscription);

      return updatedSubscription;
    } catch (error) {
      console.error('Error ending buffer period:', error);
      throw error;
    }
  }

  /**
   * Schedule monthly services for active subscription
   * @param {string} subscriptionId - The subscription ID
   * @returns {Promise<Array>} Array of created bookings
   */
  async scheduleMonthlyServices(subscriptionId) {
    try {
      const subscription = await prisma.subscription.findUnique({
        where: { id: subscriptionId },
        include: {
          plan: { include: { service: true } },
          customer: { include: { user: true } }
        }
      });

      if (!subscription || subscription.status !== 'ACTIVE') {
        throw new Error('Invalid or inactive subscription');
      }

      if (subscription.isInBufferPeriod) {
        console.log(`Subscription ${subscriptionId} is in buffer period, skipping scheduling`);
        return [];
      }

      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      
      // Calculate buffer start (3 days before month end)
      const bufferStart = new Date(monthEnd);
      bufferStart.setDate(bufferStart.getDate() - subscription.bufferDaysCount + 1);

      const sessionsPerWeek = subscription.plan.sessionsPerWeek;
      const totalSessions = subscription.plan.sessionsPerMonth;
      
      // Calculate service days (excluding buffer days)
      const availableDays = Math.floor((bufferStart - monthStart) / (1000 * 60 * 60 * 24));
      const daysBetweenServices = Math.floor(availableDays / totalSessions);

      const bookings = [];
      const user = subscription.customer.user;

      for (let i = 0; i < totalSessions; i++) {
        const serviceDate = new Date(monthStart);
        serviceDate.setDate(serviceDate.getDate() + (i * daysBetweenServices));
        
        // Skip if date is in buffer period or past
        if (serviceDate >= bufferStart || serviceDate < now) {
          continue;
        }

        // Set service time (default 9 AM or user's preferred time slot)
        const serviceTime = user.timeSlot ? 
          this.parseTimeSlot(user.timeSlot) : { hour: 9, minute: 0 };
        
        serviceDate.setHours(serviceTime.hour, serviceTime.minute, 0, 0);

        const booking = await prisma.booking.create({
          data: {
            customerId: user.id,
            serviceId: subscription.plan.serviceId,
            scheduledAt: serviceDate,
            serviceAddress: user.address || 'Address not provided',
            status: 'CONFIRMED',
            estimatedDuration: subscription.plan.service.baseDuration,
            totalAmount: subscription.plan.finalPrice / subscription.plan.sessionsPerMonth,
            finalAmount: subscription.plan.finalPrice / subscription.plan.sessionsPerMonth,
            discount: 0,
            isSubscriptionBased: true,
            specialInstructions: `Monthly subscription service - Cycle ${subscription.completedCycles + 1}`
          },
          include: {
            service: true,
            customer: true
          }
        });

        bookings.push(booking);
      }

      console.log(`Scheduled ${bookings.length} services for subscription ${subscriptionId}`);
      return bookings;
    } catch (error) {
      console.error('Error scheduling monthly services:', error);
      throw error;
    }
  }

  /**
   * Cancel bookings during buffer period
   * @param {string} subscriptionId - The subscription ID
   * @param {Date} bufferStart - Buffer period start date
   * @param {Date} bufferEnd - Buffer period end date
   */
  async cancelBufferPeriodBookings(subscriptionId, bufferStart, bufferEnd) {
    try {
      const subscription = await prisma.subscription.findUnique({
        where: { id: subscriptionId },
        include: { customer: { include: { user: true } } }
      });

      if (!subscription) return;

      // Find bookings during buffer period
      const bookingsToCancel = await prisma.booking.findMany({
        where: {
          customerId: subscription.customer.userId,
          scheduledAt: {
            gte: bufferStart,
            lte: bufferEnd
          },
          status: { in: ['PENDING', 'CONFIRMED', 'ASSIGNED'] },
          isSubscriptionBased: true
        }
      });

      for (const booking of bookingsToCancel) {
        await prisma.booking.update({
          where: { id: booking.id },
          data: {
            status: 'CANCELLED',
            isBufferSkipped: true,
            specialInstructions: `${booking.specialInstructions || ''} - Cancelled due to buffer period`
          }
        });

        // Notify about cancellation
        await notificationService.notifyBookingCancellation(booking, 'Buffer period activated');
      }

      console.log(`Cancelled ${bookingsToCancel.length} bookings for buffer period`);
    } catch (error) {
      console.error('Error cancelling buffer period bookings:', error);
    }
  }

  /**
   * Process subscription renewal
   * @param {string} subscriptionId - The subscription ID
   * @returns {Promise<Object>} New cycle or updated subscription
   */
  async processSubscriptionRenewal(subscriptionId) {
    try {
      const subscription = await prisma.subscription.findUnique({
        where: { id: subscriptionId },
        include: { 
          plan: true,
          customer: { include: { user: true } }
        }
      });

      if (!subscription) {
        throw new Error('Subscription not found');
      }

      const now = new Date();
      
      // Complete current cycle
      await prisma.subscriptionCycle.updateMany({
        where: {
          subscriptionId,
          status: { in: ['ACTIVE', 'IN_BUFFER'] }
        },
        data: {
          status: 'COMPLETED'
        }
      });

      if (subscription.autoRenew && subscription.status === 'ACTIVE') {
        // Create new cycle
        const newCycleNumber = subscription.totalCycles + 1;
        const newCycle = await this.initializeSubscriptionCycle(subscriptionId, newCycleNumber);

        // Update subscription
        await prisma.subscription.update({
          where: { id: subscriptionId },
          data: {
            completedCycles: { increment: 1 },
            lastRenewalDate: now,
            nextBillDate: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
            isInBufferPeriod: false,
            bufferStartDate: null,
            bufferEndDate: null
          }
        });

        // Schedule services for new cycle
        await this.scheduleMonthlyServices(subscriptionId);

        // Send renewal notification
        await notificationService.notifySubscriptionRenewed(subscription);

        return newCycle;
      } else {
        // Expire subscription
        const expiredSubscription = await prisma.subscription.update({
          where: { id: subscriptionId },
          data: {
            status: 'EXPIRED',
            completedCycles: { increment: 1 },
            isInBufferPeriod: false,
            bufferStartDate: null,
            bufferEndDate: null
          }
        });

        // Send expiration notification
        await notificationService.notifySubscriptionExpired(subscription);

        return expiredSubscription;
      }
    } catch (error) {
      console.error('Error processing subscription renewal:', error);
      throw error;
    }
  }

  /**
   * Get subscription status with buffer information
   * @param {string} subscriptionId - The subscription ID
   * @returns {Promise<Object>} Subscription status
   */
  async getSubscriptionStatus(subscriptionId) {
    try {
      const subscription = await prisma.subscription.findUnique({
        where: { id: subscriptionId },
        include: {
          plan: { include: { service: true } },
          customer: { include: { user: true } },
          cycles: {
            where: { status: { in: ['ACTIVE', 'IN_BUFFER'] } },
            orderBy: { createdAt: 'desc' },
            take: 1
          },
          bufferPeriods: {
            where: { status: 'ACTIVE' },
            orderBy: { createdAt: 'desc' },
            take: 1
          }
        }
      });

      if (!subscription) {
        throw new Error('Subscription not found');
      }

      const now = new Date();
      const currentCycle = subscription.cycles[0];
      const activeBuffer = subscription.bufferPeriods[0];

      // Calculate days until next buffer period
      let daysUntilBuffer = null;
      if (currentCycle && !subscription.isInBufferPeriod) {
        const bufferStart = new Date(currentCycle.endDate);
        bufferStart.setDate(bufferStart.getDate() - subscription.bufferDaysCount);
        daysUntilBuffer = Math.ceil((bufferStart - now) / (1000 * 60 * 60 * 24));
      }

      // Get upcoming bookings
      const upcomingBookings = await prisma.booking.findMany({
        where: {
          customerId: subscription.customer.userId,
          scheduledAt: { gte: now },
          status: { in: ['CONFIRMED', 'ASSIGNED'] },
          isSubscriptionBased: true
        },
        orderBy: { scheduledAt: 'asc' },
        take: 5,
        include: {
          service: true,
          maid: true
        }
      });

      return {
        subscription: {
          id: subscription.id,
          status: subscription.status,
          plan: subscription.plan,
          currentCycleStart: subscription.currentCycleStart,
          currentCycleEnd: subscription.currentCycleEnd,
          isInBufferPeriod: subscription.isInBufferPeriod,
          bufferDaysCount: subscription.bufferDaysCount,
          bufferDaysUsed: subscription.bufferDaysUsed,
          totalCycles: subscription.totalCycles,
          completedCycles: subscription.completedCycles
        },
        currentCycle,
        activeBuffer,
        daysUntilBuffer,
        upcomingBookings,
        summary: {
          servicesThisMonth: upcomingBookings.length,
          bufferPeriodActive: subscription.isInBufferPeriod,
          nextBufferStart: daysUntilBuffer > 0 ? 
            new Date(now.getTime() + daysUntilBuffer * 24 * 60 * 60 * 1000) : null,
          cycleProgress: currentCycle ? 
            Math.round(((now - currentCycle.startDate) / (currentCycle.endDate - currentCycle.startDate)) * 100) : 0
        }
      };
    } catch (error) {
      console.error('Error getting subscription status:', error);
      throw error;
    }
  }

  /**
   * Parse time slot string to hour and minute
   * @param {string} timeSlot - Time slot string (e.g., "09:00", "14:30")
   * @returns {Object} { hour, minute }
   */
  parseTimeSlot(timeSlot) {
    try {
      const [hour, minute] = timeSlot.split(':').map(Number);
      return { hour: hour || 9, minute: minute || 0 };
    } catch {
      return { hour: 9, minute: 0 }; // Default to 9 AM
    }
  }

  /**
   * Get all subscriptions needing buffer period activation
   * @returns {Promise<Array>} Subscriptions ready for buffer period
   */
  async getSubscriptionsForBufferActivation() {
    try {
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      
      // Get month end date
      const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      const bufferStart = new Date(monthEnd);
      bufferStart.setDate(bufferStart.getDate() - 2); // Start buffer 3 days before month end

      return await prisma.subscription.findMany({
        where: {
          status: 'ACTIVE',
          isInBufferPeriod: false,
          currentCycleEnd: {
            lte: new Date(bufferStart.getTime() + 24 * 60 * 60 * 1000) // Include today if it's buffer start
          }
        },
        include: {
          plan: true,
          customer: { include: { user: true } }
        }
      });
    } catch (error) {
      console.error('Error getting subscriptions for buffer activation:', error);
      return [];
    }
  }

  /**
   * Get all buffer periods that should be ended
   * @returns {Promise<Array>} Buffer periods to end
   */
  async getBufferPeriodsToEnd() {
    try {
      const now = new Date();
      
      return await prisma.bufferPeriod.findMany({
        where: {
          status: 'ACTIVE',
          autoResumeDate: {
            lte: now
          }
        },
        include: {
          subscription: {
            include: {
              plan: true,
              customer: { include: { user: true } }
            }
          }
        }
      });
    } catch (error) {
      console.error('Error getting buffer periods to end:', error);
      return [];
    }
  }
}

module.exports = new SubscriptionBufferService();
