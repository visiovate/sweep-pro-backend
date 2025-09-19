const { PrismaClient } = require('@prisma/client');
const cron = require('node-cron');
const NotificationService = require('./NotificationService');

class AutomaticServiceScheduler {
  constructor() {
    this.prisma = new PrismaClient();
  }

  /**
   * Initialize the automatic scheduler
   */
  init() {
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
   * Schedule daily services for all active subscriptions
   */
  async scheduleDailyServices() {
    console.log('📅 Scheduling daily services...');
    
    try {
      const today = new Date();
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      
      // Get all active subscriptions
      const activeSubscriptions = await this.prisma.subscription.findMany({
        where: {
          status: 'ACTIVE',
          isInBufferPeriod: false,
          isPaused: false
        },
        include: {
          customer: {
            include: {
              user: true
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

      for (const subscription of activeSubscriptions) {
        // Check if customer has paused for tomorrow
        const isBufferDay = await this.isBufferDay(subscription.id, tomorrow);
        
        if (isBufferDay) {
          console.log(`🛡️ Skipping service for customer ${subscription.customer.user.email} - Buffer day`);
          continue;
        }

        // Check if service already scheduled for tomorrow
        const existingBooking = await this.prisma.booking.findFirst({
          where: {
            customerId: subscription.customer.user.id,
            scheduledAt: {
              gte: new Date(tomorrow.setHours(0, 0, 0, 0)),
              lt: new Date(tomorrow.setHours(23, 59, 59, 999))
            },
            status: {
              not: 'CANCELLED'
            }
          }
        });

        if (existingBooking) {
          console.log(`📋 Service already scheduled for ${subscription.customer.user.email}`);
          continue;
        }

        // Create automatic booking for tomorrow
        const serviceTime = this.calculateServiceTime(subscription.customer.user.timeSlot);
        const scheduledDateTime = new Date(tomorrow);
        scheduledDateTime.setHours(serviceTime.hour, serviceTime.minute, 0, 0);

        await this.prisma.booking.create({
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
      
      // Notify admin about scheduled services
      await NotificationService.notifyAdmin('DAILY_SERVICES_SCHEDULED', {
        date: tomorrow.toISOString().split('T')[0],
        count: servicesScheduled
      });

    } catch (error) {
      console.error('❌ Error scheduling daily services:', error);
    }
  }

  /**
   * Assign maids to confirmed services
   */
  async assignMaidsToServices() {
    console.log('👩‍🔧 Assigning maids to services...');
    
    try {
      // Get unassigned bookings for today and tomorrow
      const today = new Date();
      const dayAfterTomorrow = new Date(today);
      dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 2);

      const unassignedBookings = await this.prisma.booking.findMany({
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
          await this.prisma.booking.update({
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

    } catch (error) {
      console.error('❌ Error assigning maids:', error);
    }
  }

  /**
   * Find the best available maid for a booking
   */
  async findBestMaid(booking) {
    // Get available maids within service radius
    const availableMaids = await this.prisma.user.findMany({
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
  }

  /**
   * Check if a day is a buffer day for a subscription
   */
  async isBufferDay(subscriptionId, date) {
    const bufferPeriod = await this.prisma.bufferPeriod.findFirst({
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
  }

  /**
   * Process buffer period requests
   */
  async processBufferRequests() {
    console.log('🛡️ Processing buffer period requests...');
    
    try {
      // Find buffer periods that should auto-resume
      const expiredBuffers = await this.prisma.bufferPeriod.findMany({
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
        await this.prisma.bufferPeriod.update({
          where: { id: buffer.id },
          data: {
            status: 'COMPLETED',
            resumedAt: new Date()
          }
        });

        // Update subscription
        await this.prisma.subscription.update({
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

    } catch (error) {
      console.error('❌ Error processing buffer requests:', error);
    }
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
    try {
      const subscription = await this.prisma.subscription.findUnique({
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
      const bufferPeriod = await this.prisma.bufferPeriod.create({
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
      await this.prisma.subscription.update({
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

    } catch (error) {
      console.error('❌ Error starting buffer period:', error);
      throw error;
    }
  }

  /**
   * Cancel services during buffer period
   */
  async cancelServicesInBufferPeriod(subscriptionId, startDate, endDate) {
    // Find bookings within buffer period
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

    for (const booking of bookingsToCancel) {
      await this.prisma.booking.update({
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
    await this.prisma.bufferPeriod.updateMany({
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
  }
}

module.exports = AutomaticServiceScheduler;
