const cron = require('node-cron');
const { PrismaClient } = require('@prisma/client');
const notificationService = require('../services/notificationService');
const notificationEnhancements = require('../services/notificationEnhancements');

const prisma = getPrismaClient();

/**
 * Comprehensive Notification Scheduler
 * Handles all scheduled notification tasks for Customer, Admin, and Maid roles
 */

class NotificationScheduler {
  constructor() {
    this.jobs = [];
  }

  // Initialize all scheduled jobs
  initializeAll() {
    console.log('🔔 Initializing Notification Scheduler...');

    // Booking reminders - Every hour
    this.jobs.push(cron.schedule('0 * * * *', async () => {
      await this.sendBookingReminders();
    }));

    // Booking approaching alerts - Every 30 minutes
    this.jobs.push(cron.schedule('*/30 * * * *', async () => {
      await this.sendBookingApproachingAlerts();
    }));

    // Overdue booking alerts - Every 15 minutes
    this.jobs.push(cron.schedule('*/15 * * * *', async () => {
      await this.checkOverdueBookings();
    }));

    // Assignment request expiry check - Every 10 minutes
    this.jobs.push(cron.schedule('*/10 * * * *', async () => {
      await this.checkExpiredAssignmentRequests();
    }));

    // Payment reminders - Every 6 hours
    this.jobs.push(cron.schedule('0 */6 * * *', async () => {
      await this.sendPaymentReminders();
    }));

    // Subscription expiry reminders - Daily at 9 AM
    this.jobs.push(cron.schedule('0 9 * * *', async () => {
      await this.sendSubscriptionExpiryReminders();
    }));

    // Buffer period reminders - Daily at 8 AM
    this.jobs.push(cron.schedule('0 8 * * *', async () => {
      await this.sendBufferPeriodReminders();
    }));

    // Feedback requests - Every 2 hours
    this.jobs.push(cron.schedule('0 */2 * * *', async () => {
      await this.sendFeedbackRequests();
    }));

    // Attendance alerts - Daily at 9:30 AM
    this.jobs.push(cron.schedule('30 9 * * *', async () => {
      await this.sendAttendanceAlerts();
    }));

    // Performance alerts - Weekly on Monday at 10 AM
    this.jobs.push(cron.schedule('0 10 * * 1', async () => {
      await this.sendPerformanceAlerts();
    }));

    // Maid shift reminders - Every hour during working hours (7 AM - 8 PM)
    this.jobs.push(cron.schedule('0 7-20 * * *', async () => {
      await this.sendShiftReminders();
    }));

    // Daily summary for admins - Daily at 6 PM
    this.jobs.push(cron.schedule('0 18 * * *', async () => {
      await this.sendDailySummaryToAdmins();
    }));

    // Cleanup old notifications - Daily at 2 AM
    this.jobs.push(cron.schedule('0 2 * * *', async () => {
      await this.cleanupOldNotifications();
    }));

    console.log(`✅ ${this.jobs.length} notification jobs scheduled successfully`);
  }

  // Send booking reminders for upcoming bookings (24 hours before)
  async sendBookingReminders() {
    try {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(0, 0, 0, 0);

      const dayAfterTomorrow = new Date(tomorrow);
      dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 1);

      const bookings = await prisma.booking.findMany({
        where: {
          scheduledAt: {
            gte: tomorrow,
            lt: dayAfterTomorrow
          },
          status: { in: ['CONFIRMED', 'ASSIGNED'] }
        },
        include: {
          customer: true,
          maid: true,
          service: true
        }
      });

      for (const booking of bookings) {
        await notificationService.notifyBookingReminder(booking);
      }

      console.log(`📅 Sent ${bookings.length} booking reminders`);
    } catch (error) {
      console.error('Error sending booking reminders:', error);
    }
  }

  // Send alerts for bookings approaching (2-4 hours before)
  async sendBookingApproachingAlerts() {
    try {
      const now = new Date();
      const twoHoursLater = new Date(now.getTime() + 2 * 60 * 60 * 1000);
      const fourHoursLater = new Date(now.getTime() + 4 * 60 * 60 * 1000);

      const bookings = await prisma.booking.findMany({
        where: {
          scheduledAt: {
            gte: twoHoursLater,
            lte: fourHoursLater
          },
          status: { in: ['CONFIRMED', 'ASSIGNED'] }
        },
        include: {
          customer: true,
          maid: true,
          service: true
        }
      });

      for (const booking of bookings) {
        const hoursLeft = Math.ceil((new Date(booking.scheduledAt) - now) / (1000 * 60 * 60));
        await notificationEnhancements.notifyBookingApproaching(booking, hoursLeft);
      }

      console.log(`⏰ Sent ${bookings.length} booking approaching alerts`);
    } catch (error) {
      console.error('Error sending booking approaching alerts:', error);
    }
  }

  // Check for overdue bookings
  async checkOverdueBookings() {
    try {
      const now = new Date();
      const thirtyMinutesAgo = new Date(now.getTime() - 30 * 60 * 1000);

      const overdueBookings = await prisma.booking.findMany({
        where: {
          scheduledAt: {
            lte: thirtyMinutesAgo
          },
          status: { in: ['CONFIRMED', 'ASSIGNED'] },
          actualStartTime: null
        },
        include: {
          customer: true,
          maid: true,
          service: true
        }
      });

      for (const booking of overdueBookings) {
        await notificationEnhancements.notifyBookingOverdue(booking);
      }

      if (overdueBookings.length > 0) {
        console.log(`⚠️ Found ${overdueBookings.length} overdue bookings`);
      }
    } catch (error) {
      console.error('Error checking overdue bookings:', error);
    }
  }

  // Check for expired assignment requests
  async checkExpiredAssignmentRequests() {
    try {
      const now = new Date();

      const expiredRequests = await prisma.assignmentRequest.findMany({
        where: {
          status: 'pending',
          expiresAt: {
            lte: now
          }
        },
        include: {
          booking: {
            include: {
              customer: true,
              service: true
            }
          },
          maid: {
            include: {
              user: true
            }
          }
        }
      });

      for (const request of expiredRequests) {
        // Update status to expired
        await prisma.assignmentRequest.update({
          where: { id: request.id },
          data: { status: 'expired' }
        });

        // Send notifications
        await notificationEnhancements.notifyAssignmentExpired(
          request,
          request.booking,
          request.maid
        );

        // Notify reassignment required
        await notificationEnhancements.notifyReassignmentRequired(
          request.booking,
          'Assignment request expired'
        );
      }

      if (expiredRequests.length > 0) {
        console.log(`⏱️ Processed ${expiredRequests.length} expired assignment requests`);
      }
    } catch (error) {
      console.error('Error checking expired assignment requests:', error);
    }
  }

  // Send payment reminders
  async sendPaymentReminders() {
    try {
      const pendingPayments = await prisma.payment.findMany({
        where: {
          status: 'PENDING',
          createdAt: {
            lte: new Date(Date.now() - 24 * 60 * 60 * 1000) // 24 hours ago
          }
        },
        include: {
          booking: {
            include: {
              service: true,
              customer: true
            }
          }
        }
      });

      for (const payment of pendingPayments) {
        if (payment.booking) {
          await notificationService.notifyPaymentReminder(payment.booking);

          // Check if payment is overdue (more than 3 days)
          const daysOverdue = Math.floor(
            (Date.now() - payment.createdAt.getTime()) / (1000 * 60 * 60 * 24)
          );
          
          if (daysOverdue >= 3) {
            await notificationEnhancements.notifyPaymentOverdue(
              payment,
              payment.booking,
              daysOverdue
            );
          }
        }
      }

      console.log(`💰 Sent ${pendingPayments.length} payment reminders`);
    } catch (error) {
      console.error('Error sending payment reminders:', error);
    }
  }

  // Send subscription expiry reminders
  async sendSubscriptionExpiryReminders() {
    try {
      const expiringSubscriptions = await prisma.subscription.findMany({
        where: {
          status: 'ACTIVE',
          endDate: {
            gte: new Date(),
            lte: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days from now
          }
        },
        include: {
          customer: {
            include: {
              user: true
            }
          },
          plan: true
        }
      });

      for (const subscription of expiringSubscriptions) {
        const daysLeft = Math.ceil(
          (subscription.endDate - new Date()) / (1000 * 60 * 60 * 24)
        );
        await notificationService.notifySubscriptionExpiring(subscription, daysLeft);
      }

      console.log(`📆 Sent ${expiringSubscriptions.length} subscription expiry reminders`);
    } catch (error) {
      console.error('Error sending subscription expiry reminders:', error);
    }
  }

  // Send buffer period reminders
  async sendBufferPeriodReminders() {
    try {
      // Buffer periods ending soon
      const endingBufferPeriods = await prisma.bufferPeriod.findMany({
        where: {
          status: 'ACTIVE',
          endDate: {
            gte: new Date(),
            lte: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000) // 2 days from now
          }
        },
        include: {
          subscription: {
            include: {
              customer: {
                include: {
                  user: true
                }
              },
              plan: true
            }
          }
        }
      });

      for (const bufferPeriod of endingBufferPeriods) {
        const daysLeft = Math.ceil(
          (bufferPeriod.endDate - new Date()) / (1000 * 60 * 60 * 24)
        );
        await notificationService.notifyBufferPeriodEnding(
          bufferPeriod.subscription,
          daysLeft
        );
      }

      console.log(`🛡️ Sent ${endingBufferPeriods.length} buffer period ending reminders`);
    } catch (error) {
      console.error('Error sending buffer period reminders:', error);
    }
  }

  // Send feedback requests for completed bookings
  async sendFeedbackRequests() {
    try {
      const completedBookings = await prisma.booking.findMany({
        where: {
          status: 'COMPLETED',
          completedAt: {
            gte: new Date(Date.now() - 48 * 60 * 60 * 1000), // Last 48 hours
            lte: new Date(Date.now() - 2 * 60 * 60 * 1000) // At least 2 hours ago
          },
          feedback: null
        },
        include: {
          customer: true,
          maid: true,
          service: true
        }
      });

      for (const booking of completedBookings) {
        await notificationEnhancements.notifyFeedbackRequest(booking);
      }

      console.log(`⭐ Sent ${completedBookings.length} feedback requests`);
    } catch (error) {
      console.error('Error sending feedback requests:', error);
    }
  }

  // Send attendance alerts
  async sendAttendanceAlerts() {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Get active maids
      const activeMaids = await prisma.maidProfile.findMany({
        where: {
          status: 'ACTIVE'
        },
        include: {
          user: true,
          attendance: {
            where: {
              date: today
            }
          }
        }
      });

      // Find maids who haven't checked in
      const missedCheckInMaids = activeMaids.filter(
        maid => maid.attendance.length === 0
      );

      for (const maid of missedCheckInMaids) {
        await notificationEnhancements.notifyMissedCheckIn(maid);
      }

      console.log(`👥 Sent ${missedCheckInMaids.length} missed check-in alerts`);
    } catch (error) {
      console.error('Error sending attendance alerts:', error);
    }
  }

  // Send performance alerts
  async sendPerformanceAlerts() {
    try {
      const maids = await prisma.maidProfile.findMany({
        where: {
          status: 'ACTIVE'
        },
        include: {
          user: true,
          performanceMetrics: {
            orderBy: {
              createdAt: 'desc'
            },
            take: 1
          }
        }
      });

      let alertCount = 0;

      for (const maid of maids) {
        if (maid.performanceMetrics.length > 0) {
          const metrics = maid.performanceMetrics[0];

          // Low performance alert
          if (metrics.overallScore < 3.0) {
            await notificationEnhancements.notifyLowPerformanceWarning(maid, metrics);
            alertCount++;
          }

          // High cancellation rate
          if (
            metrics.cancelledBookings > 0 &&
            metrics.cancelledBookings / metrics.totalBookings > 0.2
          ) {
            await notificationService.notifyMaidPerformanceAlert(
              maid,
              'HIGH_CANCELLATION_RATE',
              {
                cancellationRate: (metrics.cancelledBookings / metrics.totalBookings) * 100
              }
            );
            alertCount++;
          }

          // Low rating
          if (metrics.averageRating < 3.5 && metrics.totalBookings >= 5) {
            await notificationService.notifyMaidPerformanceAlert(
              maid,
              'LOW_RATING',
              {
                averageRating: metrics.averageRating,
                totalBookings: metrics.totalBookings
              }
            );
            alertCount++;
          }
        }
      }

      console.log(`📊 Sent ${alertCount} performance alerts`);
    } catch (error) {
      console.error('Error sending performance alerts:', error);
    }
  }

  // Send shift reminders
  async sendShiftReminders() {
    try {
      const now = new Date();
      const thirtyMinutesLater = new Date(now.getTime() + 30 * 60 * 1000);
      const oneHourLater = new Date(now.getTime() + 60 * 60 * 1000);

      // Get bookings starting in 30-60 minutes
      const upcomingBookings = await prisma.booking.findMany({
        where: {
          scheduledAt: {
            gte: thirtyMinutesLater,
            lte: oneHourLater
          },
          status: { in: ['ASSIGNED', 'CONFIRMED'] },
          maidId: { not: null }
        },
        include: {
          maid: true,
          customer: true,
          service: true
        }
      });

      for (const booking of upcomingBookings) {
        const shift = {
          startTime: booking.scheduledAt,
          endTime: new Date(
            booking.scheduledAt.getTime() + booking.estimatedDuration * 60 * 1000
          ),
          location: booking.serviceAddress
        };

        await notificationService.notifyMaidShiftReminder(
          { id: booking.maid.id, userId: booking.maidId },
          shift
        );
      }

      console.log(`🔔 Sent ${upcomingBookings.length} shift reminders`);
    } catch (error) {
      console.error('Error sending shift reminders:', error);
    }
  }

  // Send daily summary to admins
  async sendDailySummaryToAdmins() {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const [
        todayBookings,
        completedBookings,
        cancelledBookings,
        pendingPayments,
        activeIssues,
        newUsers
      ] = await Promise.all([
        prisma.booking.count({
          where: {
            scheduledAt: {
              gte: today,
              lt: tomorrow
            }
          }
        }),
        prisma.booking.count({
          where: {
            completedAt: {
              gte: today,
              lt: tomorrow
            },
            status: 'COMPLETED'
          }
        }),
        prisma.booking.count({
          where: {
            updatedAt: {
              gte: today,
              lt: tomorrow
            },
            status: 'CANCELLED'
          }
        }),
        prisma.payment.count({
          where: {
            status: 'PENDING'
          }
        }),
        prisma.issue.count({
          where: {
            status: { in: ['OPEN', 'IN_PROGRESS'] }
          }
        }),
        prisma.user.count({
          where: {
            createdAt: {
              gte: today,
              lt: tomorrow
            }
          }
        })
      ]);

      const notification = {
        type: 'DAILY_SUMMARY',
        title: 'Daily Summary Report',
        message: `Today's Summary: ${completedBookings} completed, ${todayBookings} total bookings`,
        data: {
          date: today.toISOString().split('T')[0],
          todayBookings,
          completedBookings,
          cancelledBookings,
          pendingPayments,
          activeIssues,
          newUsers
        },
        timestamp: new Date().toISOString()
      };

      await notificationService.sendToAdmins(notification);

      console.log('📈 Sent daily summary to admins');
    } catch (error) {
      console.error('Error sending daily summary:', error);
    }
  }

  // Cleanup old notifications (older than 90 days)
  async cleanupOldNotifications() {
    try {
      const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

      const result = await prisma.notification.deleteMany({
        where: {
          createdAt: {
            lte: ninetyDaysAgo
          },
          read: true
        }
      });

      console.log(`🗑️ Cleaned up ${result.count} old notifications`);
    } catch (error) {
      console.error('Error cleaning up old notifications:', error);
    }
  }

  // Stop all scheduled jobs
  stopAll() {
    this.jobs.forEach(job => job.stop());
    console.log('🛑 All notification jobs stopped');
  }
}

// Create singleton instance
const notificationScheduler = new NotificationScheduler();

module.exports = notificationScheduler;
