const cron = require('node-cron');
const NotificationService = require('./notificationService');
const { getPrismaClient, executeWithErrorHandling } = require('../utils/database');

class AutomaticServiceScheduler {
  constructor() {
    this.prisma = null;
  }

  /**
   * Initialize Prisma client
   */
  async initializePrisma() {
    try {
      this.prisma = getPrismaClient();
      if (!this.prisma) {
        console.warn('⚠️ Prisma client not available for AutomaticServiceScheduler');
      }
    } catch (error) {
      console.error('❌ Failed to get Prisma client for AutomaticServiceScheduler:', error);
      this.prisma = null;
    }
  }

  /**
   * Initialize the automatic scheduler
   */
  async init() {
    await this.initializePrisma();

    console.log('🤖 Initializing Automatic Service Scheduler...');
    
    // Schedule daily service creation at 6:00 AM every day
    cron.schedule('0 6 * * *', () => {
      this.scheduleDailyServices();
    });

    // Schedule maid assignment at 7:00 AM every day
    cron.schedule('0 7 * * *', () => {
      this.assignMaidsToServices();
    });

    // Check for buffer period requests every hour
    cron.schedule('0 * * * *', () => {
      this.processBufferRequests();
    });

    console.log('✅ Automatic Service Scheduler initialized');
  }

  /**
   * Get the days of week a customer should have service based on plan
   * Sweepro Touch (3 days/week): Mon, Wed, Fri
   * Sweepro Lux (6 days/week): Mon-Sat (skip maid's weekly off)
   */
  getServiceDaysForPlan(sessionsPerWeek, maidWeeklyOff = null) {
    // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
    const weekdayMap = { 'SUNDAY': 0, 'MONDAY': 1, 'TUESDAY': 2, 'WEDNESDAY': 3, 'THURSDAY': 4, 'FRIDAY': 5, 'SATURDAY': 6 };
    
    if (sessionsPerWeek === 3) {
      // 3 days/week: Mon, Wed, Fri
      return [1, 3, 5];
    } else if (sessionsPerWeek === 6) {
      // 6 days/week: All days except maid's weekly off (default Sunday if not set)
      const maidOffDay = maidWeeklyOff ? weekdayMap[maidWeeklyOff] : 0;
      return [0, 1, 2, 3, 4, 5, 6].filter(d => d !== maidOffDay);
    } else {
      // Default: every day
      return [0, 1, 2, 3, 4, 5, 6];
    }
  }

  /**
   * Check if a given date is a service day for this customer based on their plan
   */
  isServiceDay(date, sessionsPerWeek, maidWeeklyOff = null) {
    const dayOfWeek = date.getDay(); // 0 = Sunday, 1 = Monday, etc.
    const serviceDays = this.getServiceDaysForPlan(sessionsPerWeek, maidWeeklyOff);
    return serviceDays.includes(dayOfWeek);
  }

  /**
   * Schedule daily services for all active subscriptions
   * Respects plan frequency (3 or 6 days/week) and maid's weekly off
   */
  async scheduleDailyServices() {
    console.log('📅 Scheduling daily services...');
    
    return executeWithErrorHandling(async (prisma) => {
      const today = new Date();
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      
      const tomorrowDayOfWeek = tomorrow.getDay();
      const dayNames = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
      console.log(`📆 Tomorrow is ${dayNames[tomorrowDayOfWeek]}`);
      
      // Get all active subscriptions
      const activeSubscriptions = await prisma.subscription.findMany({
        where: {
          status: 'ACTIVE',
          isInBufferPeriod: false,
          isPaused: false
        },
        include: {
          customer: {
            include: {
              user: true,
              maidAssignments: {
                where: { isActive: true },
                include: {
                  maid: true
                },
                take: 1
              }
            }
          },
          plan: {
            include: {
              service: true
            }
          }
        }
      });

      let servicesScheduled = 0;
      let skippedNotServiceDay = 0;

      for (const subscription of activeSubscriptions) {
        const customerEmail = subscription.customer.user.email;
        const sessionsPerWeek = subscription.plan.sessionsPerWeek;
        
        // Get assigned maid's weekly off day
        const assignedMaid = subscription.customer.maidAssignments?.[0]?.maid;
        const maidWeeklyOff = assignedMaid?.weeklyOffDay || null;
        
        // Check if tomorrow is a service day for this plan
        if (!this.isServiceDay(tomorrow, sessionsPerWeek, maidWeeklyOff)) {
          const reason = maidWeeklyOff && tomorrow.getDay() === ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'].indexOf(maidWeeklyOff)
            ? `Maid's weekly off (${maidWeeklyOff})`
            : `Not a service day for ${sessionsPerWeek} days/week plan`;
          console.log(`⏭️ Skipping ${customerEmail} - ${reason}`);
          skippedNotServiceDay++;
          continue;
        }
        
        // Check if customer has paused for tomorrow
        const isBufferDay = await this.isBufferDay(subscription.id, tomorrow);
        
        if (isBufferDay) {
          console.log(`🛡️ Skipping service for customer ${customerEmail} - Buffer day`);
          continue;
        }

        // Check if service already scheduled for tomorrow
        const tomorrowStart = new Date(tomorrow);
        tomorrowStart.setHours(0, 0, 0, 0);
        const tomorrowEnd = new Date(tomorrow);
        tomorrowEnd.setHours(23, 59, 59, 999);
        
        const existingBooking = await prisma.booking.findFirst({
          where: {
            customerId: subscription.customer.user.id,
            scheduledAt: {
              gte: tomorrowStart,
              lt: tomorrowEnd
            },
            status: {
              not: 'CANCELLED'
            }
          }
        });

        if (existingBooking) {
          console.log(`📋 Service already scheduled for ${customerEmail}`);
          continue;
        }

        // Create automatic booking for tomorrow
        const serviceTime = this.calculateServiceTime(subscription.customer.user.timeSlot);
        const scheduledDateTime = new Date(tomorrow);
        scheduledDateTime.setHours(serviceTime.hour, serviceTime.minute, 0, 0);

        await prisma.booking.create({
          data: {
            customerId: subscription.customer.user.id,
            serviceId: subscription.plan.service.id,
            status: 'CONFIRMED',
            priority: 'NORMAL',
            scheduledAt: scheduledDateTime,
            estimatedDuration: subscription.plan.service.baseDuration,
            serviceAddress: subscription.customer.user.address,
            serviceLatitude: subscription.customer.user.latitude,
            serviceLongitude: subscription.customer.user.longitude,
            totalAmount: 0, // Subscription based
            discount: 0,
            finalAmount: 0,
            isSubscriptionBased: true,
            isBufferSkipped: false,
            specialInstructions: 'Automatic daily service from subscription'
          }
        });

        servicesScheduled++;
      }

      console.log(`✅ Scheduled ${servicesScheduled} services for tomorrow`);
      console.log(`⏭️ Skipped ${skippedNotServiceDay} (not service day for their plan)`);
      
      // Notify admin about scheduled services
      await NotificationService.notifyAdmin('DAILY_SERVICES_SCHEDULED', {
        date: tomorrow.toISOString().split('T')[0],
        count: servicesScheduled
      });

    }, 'Schedule daily services');
  }

  /**
   * Assign maids to confirmed services
   */
  async assignMaidsToServices() {
    console.log('👩‍🔧 Assigning maids to services...');
    
    return executeWithErrorHandling(async (prisma) => {
      // Get unassigned bookings for today and tomorrow
      const today = new Date();
      const dayAfterTomorrow = new Date(today);
      dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 2);

      const unassignedBookings = await prisma.booking.findMany({
        where: {
          maidId: null,
          status: 'CONFIRMED',
          scheduledAt: {
            gte: today,
            lt: dayAfterTomorrow
          },
          isBufferSkipped: false
        },
        include: {
          customer: true,
          service: true
        },
        orderBy: {
          scheduledAt: 'asc'
        }
      });

      let assignmentsCompleted = 0;

      for (const booking of unassignedBookings) {
        const assignedMaid = await this.findBestMaid(booking);
        
        if (assignedMaid) {
          await prisma.booking.update({
            where: { id: booking.id },
            data: { 
              maidId: assignedMaid.id,
              status: 'ASSIGNED'
            }
          });

          // Notify customer about maid assignment
          await NotificationService.notifyCustomer(booking.customerId, 'MAID_ASSIGNED', {
            maidName: assignedMaid.name,
            serviceName: booking.service.name,
            scheduledAt: booking.scheduledAt
          });

          // Notify maid about new assignment
          await NotificationService.notifyMaid(assignedMaid.id, 'SERVICE_ASSIGNED', {
            customerName: booking.customer.name,
            serviceName: booking.service.name,
            scheduledAt: booking.scheduledAt,
            address: booking.serviceAddress
          });

          assignmentsCompleted++;
        } else {
          // Notify admin about unassigned service
          await NotificationService.notifyAdmin('UNASSIGNED_SERVICE', {
            bookingId: booking.id,
            customerName: booking.customer.name,
            scheduledAt: booking.scheduledAt
          });
        }
      }

      console.log(`✅ Completed ${assignmentsCompleted} maid assignments`);

    }, 'Assign maids to services');
  }

  /**
   * Find the best available maid for a booking
   */
  async findBestMaid(booking) {
    return executeWithErrorHandling(async (prisma) => {
      // Get available maids within service radius
      const availableMaids = await prisma.user.findMany({
      where: {
        role: 'MAID',
        status: 'ACTIVE',
        maidProfile: {
          status: 'ACTIVE'
        }
      },
      include: {
        maidProfile: true
      }
      });

      // Filter maids by availability and skills
      const suitableMaids = availableMaids.filter(maid => {
        const profile = maid.maidProfile;
        
        // Check if maid is not already assigned at this time
        // Check if maid has required skills
        // Check if maid is within service radius
        return profile && 
               profile.status === 'ACTIVE' && 
               this.isWithinRadius(
                 booking.serviceLatitude, 
                 booking.serviceLongitude, 
                 maid.latitude, 
                 maid.longitude, 
                 profile.serviceRadius
               );
      });

      if (suitableMaids.length === 0) {
        return null;
      }

      // Sort by rating and availability
      suitableMaids.sort((a, b) => b.maidProfile.rating - a.maidProfile.rating);
      
      return suitableMaids[0];
    }, 'Find best maid');
  }

  /**
   * Check if a day is a buffer day for a subscription
   */
  async isBufferDay(subscriptionId, date) {
    return executeWithErrorHandling(async (prisma) => {
      const bufferPeriod = await prisma.bufferPeriod.findFirst({
        where: {
          subscriptionId,
          status: 'ACTIVE',
          startDate: {
            lte: date
          },
          endDate: {
            gte: date
          }
        }
      });

      return !!bufferPeriod;
    }, 'Check buffer day');
  }

  /**
   * Process buffer period requests
   */
  async processBufferRequests() {
    console.log('🛡️ Processing buffer period requests...');
    
    return executeWithErrorHandling(async (prisma) => {
      // Find buffer periods that should auto-resume
      const expiredBuffers = await prisma.bufferPeriod.findMany({
        where: {
          status: 'ACTIVE',
          autoResumeDate: {
            lte: new Date()
          }
        },
        include: {
          subscription: {
            include: {
              customer: {
                include: {
                  user: true
                }
              }
            }
          }
        }
      });

      for (const buffer of expiredBuffers) {
        // End buffer period
        await prisma.bufferPeriod.update({
          where: { id: buffer.id },
          data: {
            status: 'COMPLETED',
            resumedAt: new Date()
          }
        });

        // Update subscription
        await prisma.subscription.update({
          where: { id: buffer.subscriptionId },
          data: {
            isInBufferPeriod: false,
            bufferStartDate: null,
            bufferEndDate: null
          }
        });

        // Notify customer about service resumption
        await NotificationService.notifyCustomer(
          buffer.subscription.customer.user.id, 
          'BUFFER_PERIOD_ENDED', 
          {
            reason: buffer.reason,
            resumedAt: new Date()
          }
        );

        // Notify admin
        await NotificationService.notifyAdmin('BUFFER_PERIOD_ENDED', {
          customerName: buffer.subscription.customer.user.name,
          bufferDays: buffer.daysCount
        });
      }

      console.log(`✅ Processed ${expiredBuffers.length} buffer period completions`);

    }, 'Process buffer requests');
  }

  /**
   * Calculate service time based on customer time slot
   */
  calculateServiceTime(timeSlot) {
    if (!timeSlot) {
      return { hour: 9, minute: 0 }; // Default 9:00 AM
    }

    // Parse time slot like "09:00-12:00"
    const [startTime] = timeSlot.split('-');
    const [hour, minute] = startTime.split(':').map(Number);
    
    return { hour, minute };
  }

  /**
   * Check if location is within service radius
   */
  isWithinRadius(lat1, lng1, lat2, lng2, radius) {
    if (!lat1 || !lng1 || !lat2 || !lng2) return false;

    const R = 6371; // Radius of Earth in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
      Math.sin(dLng/2) * Math.sin(dLng/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    const distance = R * c; // Distance in km

    return distance <= radius;
  }

  /**
   * Start buffer period for customer
   */
  async startBufferPeriod(subscriptionId, daysCount, reason = 'CUSTOMER_REQUEST', notes = '') {
    return executeWithErrorHandling(async (prisma) => {
      const subscription = await prisma.subscription.findUnique({
        where: { id: subscriptionId },
        include: {
          customer: {
            include: { user: true }
          }
        }
      });

      if (!subscription) {
        throw new Error('Subscription not found');
      }

      // Check if customer has enough buffer days
      const remainingBufferDays = subscription.bufferDaysCount - subscription.bufferDaysUsed;
      if (remainingBufferDays < daysCount) {
        throw new Error(`Not enough buffer days. Remaining: ${remainingBufferDays}`);
      }

      const startDate = new Date();
      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + daysCount);

      // Create buffer period
      const bufferPeriod = await prisma.bufferPeriod.create({
        data: {
          subscriptionId,
          startDate,
          endDate,
          status: 'ACTIVE',
          reason,
          daysCount,
          servicesSkipped: 0,
          autoResumeDate: endDate,
          isAutomatic: false,
          notes
        }
      });

      // Update subscription
      await prisma.subscription.update({
        where: { id: subscriptionId },
        data: {
          isInBufferPeriod: true,
          bufferStartDate: startDate,
          bufferEndDate: endDate,
          bufferDaysUsed: subscription.bufferDaysUsed + daysCount
        }
      });

      // Cancel services during buffer period
      await this.cancelServicesInBufferPeriod(subscriptionId, startDate, endDate);

      // Notify admin about buffer period start
      await NotificationService.notifyAdmin('BUFFER_PERIOD_STARTED', {
        customerName: subscription.customer.user.name,
        customerEmail: subscription.customer.user.email,
        startDate,
        endDate,
        daysCount,
        reason,
        notes
      });

      console.log(`🛡️ Started buffer period for ${subscription.customer.user.email}`);
      return bufferPeriod;
    });
  }

  /**
   * Cancel services during buffer period
   */
  async cancelServicesInBufferPeriod(subscriptionId, startDate, endDate) {
    return executeWithErrorHandling(async (prisma) => {
      // Find bookings within buffer period
      const bookingsToCancel = await prisma.booking.findMany({
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

      for (const booking of bookingsToCancel) {
        await prisma.booking.update({
          where: { id: booking.id },
          data: {
            status: 'CANCELLED',
            isBufferSkipped: true,
            specialInstructions: 'Service cancelled due to buffer period'
          }
        });

        // Notify maid about cancellation if assigned
        if (booking.maidId) {
          await NotificationService.notifyMaid(booking.maidId, 'SERVICE_CANCELLED', {
            reason: 'Customer buffer period',
            scheduledAt: booking.scheduledAt
          });
        }
      }

      // Update buffer period with services skipped count
      await prisma.bufferPeriod.updateMany({
        where: {
          subscriptionId,
          startDate,
          endDate,
          status: 'ACTIVE'
        },
        data: {
          servicesSkipped: bookingsToCancel.length
        }
      });

      return bookingsToCancel.length;
    });
  }
}

module.exports = AutomaticServiceScheduler;
