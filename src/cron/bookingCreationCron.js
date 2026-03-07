/**
 * Booking Creation Cron - Creates tomorrow's bookings for active subscriptions
 *
 * This module creates bookings for all customers with active subscriptions
 * for the next day. It's idempotent - running it multiple times won't create
 * duplicate bookings.
 */

const { getPrismaClient } = require('../utils/database');
const { retryPrismaOperation } = require('../utils/retryUtils');
const { formatDateTimeForLog, getWeekdayName } = require('../utils/timeUtils');

// Constants for assignment request expiry
const ASSIGNMENT_REQUEST_EXPIRY_HOURS = 24; // Assignment request expires after 24 hours
const MIN_HOURS_BEFORE_SERVICE = 2; // Minimum hours before service to accept assignment

/**
 * Create bookings for tomorrow for all active customer assignments
 * @returns {Object} Stats about created/skipped bookings
 */
async function createBookingsForTomorrow() {
  const stats = {
    created: 0,
    skippedExists: 0,
    skippedBuffer: 0,
    skippedWeeklyOff: 0,
    skippedNoService: 0,
    skippedNoProfile: 0,
    skippedNoSubscription: 0,
    skippedInactiveSubscription: 0,
    errors: 0
  };

  // Calculate tomorrow's date range
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  tomorrow.setUTCHours(0, 0, 0, 0);

  const dayAfterTomorrow = new Date(tomorrow);
  dayAfterTomorrow.setUTCDate(dayAfterTomorrow.getUTCDate() + 1);

  const tomorrowWeekday = getWeekdayName(tomorrow);

  console.log(`\n📆 Tomorrow's bookings: ${tomorrow.toISOString().split('T')[0]} (${tomorrowWeekday.toUpperCase()})`);

  // Get all active customer-maid assignments with subscriptions
  const activeAssignments = await retryPrismaOperation(
    () => getPrismaClient().customerMaidAssignment.findMany({
      where: {
        isActive: true
      },
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            email: true,
            address: true,
            timeSlot: true,
            customerProfile: {
              select: {
                subscription: {
                  select: {
                    id: true,
                    status: true,
                    isInBufferPeriod: true,
                    bufferStartDate: true,
                    bufferEndDate: true,
                    plan: {
                      select: {
                        sessionsPerWeek: true
                      }
                    }
                  }
                }
              }
            }
          }
        },
        maid: {
          select: {
            id: true,
            userId: true,
            weeklyOffDay: true,
            user: {
              select: {
                id: true,
                name: true
              }
            }
          }
        }
      }
    }),
    'Fetch active assignments'
  );

  console.log(`📋 Found ${activeAssignments.length} active assignment(s) to process`);

  // Debug: List all customers with assignments
  if (activeAssignments.length > 0) {
    console.log('\n👥 Customers with active maid assignments:');
    for (const assignment of activeAssignments) {
      const custName = assignment.customer?.name || 'Unknown';
      const maidName = assignment.maid?.user?.name || 'Unknown Maid';
      const hasProfile = !!assignment.customer?.customerProfile;
      const hasSub = !!assignment.customer?.customerProfile?.subscription;
      const subStatus = assignment.customer?.customerProfile?.subscription?.status || 'N/A';
      console.log(`   - ${custName} → Maid: ${maidName} | Profile: ${hasProfile ? '✓' : '✗'} | Subscription: ${hasSub ? subStatus : 'None'}`);
    }
    console.log('');
  }

  // Get default service for automatic bookings
  let defaultService = await getPrismaClient().service.findFirst({
    where: {
      isActive: true,
      isSubscriptionService: true
    }
  });

  if (!defaultService) {
    defaultService = await getPrismaClient().service.findFirst({
      where: { isActive: true }
    });
  }

  if (!defaultService) {
    console.error('❌ No active service found for automatic bookings');
    return stats;
  }

  // Process each assignment
  for (const assignment of activeAssignments) {
    const { customer, maid } = assignment;
    const customerName = customer.name || 'Customer';
    const subscription = customer.customerProfile?.subscription;

    try {
      // Skip if no active subscription - with logging
      if (!customer.customerProfile) {
        console.log(`  ⚠️  ${customerName} -- no customer profile found`);
        stats.skippedNoProfile++;
        continue;
      }

      if (!subscription) {
        console.log(`  ⚠️  ${customerName} -- no subscription found`);
        stats.skippedNoSubscription++;
        continue;
      }

      if (subscription.status !== 'ACTIVE') {
        console.log(`  ⚠️  ${customerName} -- subscription not active (status: ${subscription.status})`);
        stats.skippedInactiveSubscription++;
        continue;
      }

      // Check if customer is in buffer period
      if (subscription.isInBufferPeriod) {
        const bufferStart = subscription.bufferStartDate ? new Date(subscription.bufferStartDate) : null;
        const bufferEnd = subscription.bufferEndDate ? new Date(subscription.bufferEndDate) : null;

        if (bufferStart && bufferEnd && tomorrow >= bufferStart && tomorrow <= bufferEnd) {
          console.log(`  ⏸️  ${customerName} -- in buffer period`);
          stats.skippedBuffer++;
          continue;
        }
      }

      // Check if it's maid's weekly off day
      if (maid.weeklyOffDay) {
        const normalizedWeekday = tomorrowWeekday.toUpperCase();
        const normalizedOffDay = maid.weeklyOffDay.toUpperCase();
        if (normalizedWeekday === normalizedOffDay) {
          console.log(`  🏖️  ${customerName} -- maid's weekly off (${maid.weeklyOffDay})`);
          stats.skippedWeeklyOff++;
          continue;
        }
      }

      // Parse customer's time slot to get service time
      // TimeSlot format is "HH:MM-HH:MM" (start-end) in IST
      const timeSlot = customer.timeSlot || '09:00-12:00';
      const startTime = timeSlot.split('-')[0] || '09:00'; // Get start time from range
      const [hoursIST, minutesIST] = startTime.split(':').map(Number);

      // Convert IST to UTC (IST is UTC+5:30, so subtract 5.5 hours)
      // Create scheduled datetime for tomorrow in IST, then convert to UTC
      const scheduledAtIST = new Date(tomorrow);
      scheduledAtIST.setUTCHours(hoursIST || 9, minutesIST || 0, 0, 0);

      // Convert IST to UTC by subtracting 5.5 hours (IST offset)
      const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
      const scheduledAt = new Date(scheduledAtIST.getTime() - IST_OFFSET_MS);

      // Check if booking already exists for this customer tomorrow
      const existingBooking = await getPrismaClient().booking.findFirst({
        where: {
          customerId: customer.id,
          scheduledAt: {
            gte: tomorrow,
            lt: dayAfterTomorrow
          }
        }
      });

      if (existingBooking) {
        const existingTime = new Date(existingBooking.scheduledAt);
        // Convert UTC to IST for display
        const existingIST = new Date(existingTime.getTime() + (5.5 * 60 * 60 * 1000));
        const timeStr = `${existingIST.getUTCHours().toString().padStart(2, '0')}:${existingIST.getUTCMinutes().toString().padStart(2, '0')}`;
        console.log(`  📋 ${customerName} -- already exists (${existingBooking.id.substring(0, 8)}...) @ ${timeStr} IST`);
        stats.skippedExists++;
        continue;
      }

      // Create the booking
      const booking = await getPrismaClient().booking.create({
        data: {
          customerId: customer.id,
          maidId: maid.userId,
          serviceId: defaultService.id,
          scheduledAt: scheduledAt,
          slot_date: tomorrow,
          slot_time: scheduledAt,
          timeSlot: timeSlot,
          status: 'PENDING',
          assignmentStatus: 'PENDING_ASSIGNMENT',
          assignment_sent: false,
          totalAmount: defaultService.basePrice,
          finalAmount: defaultService.basePrice,
          serviceAddress: customer.address || 'Customer Address',
          estimatedDuration: defaultService.baseDuration,
          isAutomatic: true,
          specialInstructions: `Automatic booking for ${timeSlot} time slot`
        }
      });

      // Calculate expiry time for the assignment request
      // Give maid time to respond, but ensure they respond before 2 hours before service
      const hoursBeforeService = (scheduledAt.getTime() - now.getTime()) / (1000 * 60 * 60);
      let expiresAt;
      if (hoursBeforeService > ASSIGNMENT_REQUEST_EXPIRY_HOURS + MIN_HOURS_BEFORE_SERVICE) {
        // Give maid full 24 hours to respond
        expiresAt = new Date(now.getTime() + (ASSIGNMENT_REQUEST_EXPIRY_HOURS * 60 * 60 * 1000));
      } else {
        // Give maid until 2 hours before service
        expiresAt = new Date(scheduledAt.getTime() - (MIN_HOURS_BEFORE_SERVICE * 60 * 60 * 1000));
      }

      // Create AssignmentRequest so maid can accept/reject
      const assignmentRequest = await getPrismaClient().assignmentRequest.create({
        data: {
          bookingId: booking.id,
          maidId: maid.id, // MaidProfile ID, not User ID
          status: 'pending',
          expiresAt: expiresAt
        }
      });

      // Update booking to mark that assignment request has been sent
      await getPrismaClient().booking.update({
        where: { id: booking.id },
        data: {
          assignment_sent: true,
          assignment_sent_at: now
        }
      });

      const timeStrIST = `${String(hoursIST || 9).padStart(2, '0')}:${String(minutesIST || 0).padStart(2, '0')}`;
      const timeStrUTC = `${scheduledAt.getUTCHours().toString().padStart(2, '0')}:${scheduledAt.getUTCMinutes().toString().padStart(2, '0')}`;

      // Create notification for the maid
      try {
        await getPrismaClient().notification.create({
          data: {
            userId: maid.userId,
            type: 'ASSIGNMENT_REQUEST',
            title: 'New Service Assignment Request',
            message: `You have a new automatic service assignment for ${customerName} on ${tomorrow.toISOString().split('T')[0]} at ${timeStrIST} IST. Please respond within 24 hours.`,
            data: {
              bookingId: booking.id,
              assignmentRequestId: assignmentRequest.id,
              serviceAddress: customer.address,
              scheduledAt: scheduledAt.toISOString(),
              expiresAt: expiresAt.toISOString()
            }
          }
        });
      } catch (notifError) {
        console.warn(`  ⚠️ Failed to send notification to maid: ${notifError.message}`);
      }

      console.log(`  ✅ ${customerName} -- created (${booking.id.substring(0, 8)}...) @ ${timeStrIST} IST (${timeStrUTC} UTC)`);
      stats.created++;

    } catch (error) {
      console.error(`  ❌ ${customerName} -- error: ${error.message}`);
      stats.errors++;
    }
  }

  console.log(`\n📊 Summary:`);
  console.log(`   ✅ Created: ${stats.created}`);
  console.log(`   📋 Already existed: ${stats.skippedExists}`);
  console.log(`   ⏸️  In buffer: ${stats.skippedBuffer}`);
  console.log(`   🏖️  Weekly off: ${stats.skippedWeeklyOff}`);
  if (stats.skippedNoProfile > 0) console.log(`   ⚠️  No profile: ${stats.skippedNoProfile}`);
  if (stats.skippedNoSubscription > 0) console.log(`   ⚠️  No subscription: ${stats.skippedNoSubscription}`);
  if (stats.skippedInactiveSubscription > 0) console.log(`   ⚠️  Inactive subscription: ${stats.skippedInactiveSubscription}`);
  if (stats.errors > 0) console.log(`   ❌ Errors: ${stats.errors}`);

  return stats;
}

module.exports = {
  createBookingsForTomorrow
};
