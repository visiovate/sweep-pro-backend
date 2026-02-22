/**
 * Expired Assignment Requests Cron Job
 * 
 * Handles:
 * 1. Assignment requests that have expired without maid response
 * 2. Auto-escalation: pending requests within 2 hours of service → admin reassignment
 * 3. Past-due bookings: unassigned bookings whose service time has passed → INCOMPLETE
 * 
 * Runs every 15–30 minutes
 * 
 * Command: node src/cron/expiredRequestsCron.js
 */

const { initializePrisma, getPrismaClient } = require("../utils/database");
const { retryPrismaOperation, withTimeout } = require('../utils/retryUtils');
const {
  combineSlotDateTime,
  getCurrentUTC,
  formatDateTimeForLog,
} = require('../utils/timeUtils');

const CRON_TIMEOUT_MS = 3 * 60 * 1000; // 3 minutes

async function runCron() {
  const startTime = Date.now();
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('║   ⏰ EXPIRED REQUESTS + ESCALATION CRON JOB');
  console.log(`║   Started: ${new Date().toISOString()}`);
  console.log('═══════════════════════════════════════════════════════\n');

  let stats = {
    expiredFound: 0, expiredProcessed: 0, expiredErrors: 0,
    escalatedFound: 0, escalatedProcessed: 0, escalatedErrors: 0,
    incompleteFound: 0, incompleteProcessed: 0, incompleteErrors: 0,
  };

  try {
    // Initialize Prisma database connection
    await initializePrisma();

    // Step 1: Handle expired assignment requests (existing logic)
    console.log('\n📋 Step 1: Processing expired assignment requests...\n');
    await processExpiredRequests(stats);

    // Step 2: Auto-escalate unapproved assignments within 2 hours of service
    console.log('\n⚡ Step 2: Escalating unapproved assignments (2h before service)...\n');
    await escalateUnapprovedAssignments(stats);

    // Step 3: Mark past-due unassigned bookings as INCOMPLETE
    console.log('\n📛 Step 3: Marking past-due unassigned bookings as INCOMPLETE...\n');
    await markPastDueBookingsIncomplete(stats);

    const duration = Date.now() - startTime;
    console.log('\n═══════════════════════════════════════════════════════');
    console.log('║   ✅ CRON JOB COMPLETED');
    console.log(`║   Duration: ${duration}ms`);
    console.log(`║   Expired:    Found=${stats.expiredFound}, Processed=${stats.expiredProcessed}, Errors=${stats.expiredErrors}`);
    console.log(`║   Escalated:  Found=${stats.escalatedFound}, Processed=${stats.escalatedProcessed}, Errors=${stats.escalatedErrors}`);
    console.log(`║   Incomplete: Found=${stats.incompleteFound}, Processed=${stats.incompleteProcessed}, Errors=${stats.incompleteErrors}`);
    console.log('═══════════════════════════════════════════════════════\n');

    await getPrismaClient().$disconnect();
    process.exit(0);

  } catch (error) {
    const duration = Date.now() - startTime;
    console.error('\n═══════════════════════════════════════════════════════');
    console.error('║   ❌ CRON JOB FAILED');
    console.error(`║   Duration: ${duration}ms`);
    console.error(`║   Error: ${error.message}`);
    console.error('═══════════════════════════════════════════════════════\n');

    try { await getPrismaClient().$disconnect(); } catch (e) { }
    process.exit(1);
  }
}

/**
 * Step 1: Process expired assignment requests
 * (Original logic - handles requests whose expiresAt has passed)
 */
async function processExpiredRequests(stats) {
  const now = new Date();
  const prisma = getPrismaClient();

  const expiredRequests = await retryPrismaOperation(
    () => prisma.assignmentRequest.findMany({
      where: {
        status: 'pending',
        expiresAt: { lt: now },
      },
      include: {
        booking: {
          select: {
            id: true,
            customerId: true,
            status: true,
          },
        },
        maid: {
          select: {
            id: true,
            user: {
              select: { name: true },
            },
          },
        },
      },
      take: 100,
    }),
    'Find expired requests'
  );

  stats.expiredFound = expiredRequests.length;
  console.log(`📋 Found ${expiredRequests.length} expired request(s)`);

  for (const request of expiredRequests) {
    try {
      await retryPrismaOperation(
        () => prisma.$transaction(async (tx) => {
          // Mark request as expired
          await tx.assignmentRequest.update({
            where: { id: request.id },
            data: {
              status: 'expired',
              respondedAt: now,
            },
          });

          // Update booking status
          await tx.booking.update({
            where: { id: request.bookingId },
            data: {
              assignmentStatus: 'REJECTED',
              rejectionReason: 'Assignment request expired - no response from maid',
              maidId: null,
            },
          });

          // Create notification for customer
          await tx.notification.create({
            data: {
              userId: request.booking.customerId,
              type: 'ASSIGNMENT_FAILED',
              title: 'Assignment Request Expired',
              message: 'The maid did not respond to the assignment request. We will find another maid for you.',
              data: {
                bookingId: request.bookingId,
              },
            },
          });
        }),
        `Process expired request ${request.id}`
      );

      stats.expiredProcessed++;
      console.log(`✅ Processed expired request ${request.id}`);

    } catch (error) {
      stats.expiredErrors++;
      console.error(`❌ Failed to process request ${request.id}:`, error.message);
    }
  }
}

/**
 * Step 2: Auto-escalate unapproved assignment requests
 * 
 * Finds pending assignment requests where the booking's service time
 * is within 2 hours from now. These are escalated to admin reassignment.
 */
async function escalateUnapprovedAssignments(stats) {
  const now = new Date();
  const twoHoursFromNow = new Date(now.getTime() + (2 * 60 * 60 * 1000));
  const prisma = getPrismaClient();

  // Find pending assignment requests where service time is within 2 hours
  const urgentRequests = await retryPrismaOperation(
    () => prisma.assignmentRequest.findMany({
      where: {
        status: 'pending',
        // expiresAt has NOT yet passed (still "pending", not yet "expired")
        expiresAt: { gte: now },
      },
      include: {
        booking: {
          include: {
            customer: {
              select: { id: true, name: true, email: true },
            },
            service: {
              select: { id: true, name: true },
            },
          },
        },
        maid: {
          include: {
            user: {
              select: { id: true, name: true },
            },
          },
        },
      },
      take: 100,
    }),
    'Find urgent unapproved assignments'
  );

  // Filter: only those whose service time is within 2 hours from now
  const escalatableRequests = urgentRequests.filter(request => {
    const booking = request.booking;
    // Use combined slot_date + slot_time if available, fallback to scheduledAt
    let serviceDateTime;
    if (booking.slot_date && booking.slot_time) {
      serviceDateTime = combineSlotDateTime(booking.slot_date, booking.slot_time);
    }
    if (!serviceDateTime) {
      serviceDateTime = new Date(booking.scheduledAt);
    }

    // Service time must be in the future but within 2 hours
    return serviceDateTime > now && serviceDateTime <= twoHoursFromNow;
  });

  stats.escalatedFound = escalatableRequests.length;
  console.log(`⚡ Found ${escalatableRequests.length} assignment(s) to escalate (service within 2 hours)`);

  for (const request of escalatableRequests) {
    try {
      await retryPrismaOperation(
        () => prisma.$transaction(async (tx) => {
          // Mark assignment request as expired (auto-escalated)
          await tx.assignmentRequest.update({
            where: { id: request.id },
            data: {
              status: 'expired',
              respondedAt: now,
              rejectionReason: 'Auto-escalated: no response 2 hours before service',
            },
          });

          // Update booking for admin reassignment
          await tx.booking.update({
            where: { id: request.bookingId },
            data: {
              assignmentStatus: 'REJECTED',
              rejectionReason: 'Auto-escalated: no maid response 2 hours before service',
              maidId: null,
              maidResponseAt: now,
              reassignmentCount: { increment: 1 },
            },
          });

          // Notify all admins about the escalation
          const admins = await tx.user.findMany({
            where: { role: 'ADMIN' },
            select: { id: true },
          });

          if (admins.length > 0) {
            const customerName = request.booking.customer?.name || 'Customer';
            const maidName = request.maid?.user?.name || 'Maid';
            const serviceName = request.booking.service?.name || 'Service';

            await tx.notification.createMany({
              data: admins.map(admin => ({
                userId: admin.id,
                type: 'REASSIGNMENT_REQUIRED',
                title: 'Urgent: Assignment Auto-Escalated',
                message: `Assignment for ${customerName} was not responded to by ${maidName}. Service "${serviceName}" is within 2 hours. Immediate reassignment required.`,
                data: {
                  bookingId: request.bookingId,
                  customerId: request.booking.customerId,
                  maidId: request.maidId,
                  reason: 'AUTO_ESCALATED_2HR',
                  customerName,
                  maidName,
                  serviceName,
                  scheduledAt: request.booking.scheduledAt,
                },
              })),
            });
          }

          // Also notify the customer
          await tx.notification.create({
            data: {
              userId: request.booking.customerId,
              type: 'ASSIGNMENT_EXPIRED',
              title: 'Assignment Being Reassigned',
              message: 'Your maid has not confirmed the upcoming booking. Our admin team is assigning a replacement.',
              data: {
                bookingId: request.bookingId,
                reason: 'AUTO_ESCALATED_2HR',
              },
            },
          });
        }),
        `Escalate assignment request ${request.id}`
      );

      stats.escalatedProcessed++;
      console.log(`⚡ Escalated assignment request ${request.id} → admin reassignment (Booking: ${request.bookingId})`);

    } catch (error) {
      stats.escalatedErrors++;
      console.error(`❌ Failed to escalate request ${request.id}:`, error.message);
    }
  }
}

/**
 * Step 3: Mark past-due unassigned bookings as INCOMPLETE
 * 
 * Finds bookings where:
 * - status is PENDING or CONFIRMED
 * - maidId is null (no maid assigned)
 * - scheduledAt / service time has already passed
 * 
 * These bookings are marked as INCOMPLETE.
 */
async function markPastDueBookingsIncomplete(stats) {
  const now = new Date();
  const prisma = getPrismaClient();

  // Find bookings that are past due and still unassigned
  const pastDueBookings = await retryPrismaOperation(
    () => prisma.booking.findMany({
      where: {
        status: { in: ['PENDING', 'CONFIRMED'] },
        maidId: null,
        scheduledAt: { lt: now },
      },
      include: {
        customer: {
          select: { id: true, name: true },
        },
        service: {
          select: { id: true, name: true },
        },
      },
      take: 100,
    }),
    'Find past-due unassigned bookings'
  );

  // Further filter by combined slot_date + slot_time if available
  const incompleteBookings = pastDueBookings.filter(booking => {
    let serviceDateTime;
    if (booking.slot_date && booking.slot_time) {
      serviceDateTime = combineSlotDateTime(booking.slot_date, booking.slot_time);
    }
    if (!serviceDateTime) {
      serviceDateTime = new Date(booking.scheduledAt);
    }
    return serviceDateTime < now;
  });

  stats.incompleteFound = incompleteBookings.length;
  console.log(`📛 Found ${incompleteBookings.length} past-due unassigned booking(s)`);

  for (const booking of incompleteBookings) {
    try {
      await retryPrismaOperation(
        () => prisma.$transaction(async (tx) => {
          // Mark booking as INCOMPLETE
          await tx.booking.update({
            where: { id: booking.id },
            data: {
              status: 'INCOMPLETE',
              assignmentStatus: 'REJECTED',
              rejectionReason: 'Service time passed without maid assignment',
            },
          });

          // Cancel any remaining pending assignment requests for this booking
          await tx.assignmentRequest.updateMany({
            where: {
              bookingId: booking.id,
              status: 'pending',
            },
            data: {
              status: 'expired',
              respondedAt: now,
              rejectionReason: 'Booking marked as incomplete - service time passed',
            },
          });

          // Notify admins
          const admins = await tx.user.findMany({
            where: { role: 'ADMIN' },
            select: { id: true },
          });

          if (admins.length > 0) {
            const customerName = booking.customer?.name || 'Customer';
            const serviceName = booking.service?.name || 'Service';

            await tx.notification.createMany({
              data: admins.map(admin => ({
                userId: admin.id,
                type: 'BOOKING_OVERDUE',
                title: 'Booking Marked Incomplete',
                message: `Booking for ${customerName} ("${serviceName}") has been marked as INCOMPLETE. Service time passed without a maid being assigned.`,
                data: {
                  bookingId: booking.id,
                  customerId: booking.customerId,
                  reason: 'PAST_DUE_NO_ASSIGNMENT',
                  customerName,
                  serviceName,
                  scheduledAt: booking.scheduledAt,
                },
              })),
            });
          }

          // Notify customer
          await tx.notification.create({
            data: {
              userId: booking.customerId,
              type: 'BOOKING_STATUS_CHANGED',
              title: 'Booking Incomplete',
              message: 'We were unable to assign a maid for your scheduled service. Our team will contact you to reschedule.',
              data: {
                bookingId: booking.id,
                status: 'INCOMPLETE',
                reason: 'PAST_DUE_NO_ASSIGNMENT',
              },
            },
          });
        }),
        `Mark booking ${booking.id} as INCOMPLETE`
      );

      stats.incompleteProcessed++;
      console.log(`📛 Marked booking ${booking.id} as INCOMPLETE (Customer: ${booking.customer?.name})`);

    } catch (error) {
      stats.incompleteErrors++;
      console.error(`❌ Failed to mark booking ${booking.id} as INCOMPLETE:`, error.message);
    }
  }
}

// Signal handlers
process.on('SIGTERM', async () => {
  try { await getPrismaClient().$disconnect(); } catch (e) { }
  process.exit(143);
});

process.on('SIGINT', async () => {
  try { await getPrismaClient().$disconnect(); } catch (e) { }
  process.exit(130);
});

withTimeout(runCron(), CRON_TIMEOUT_MS, 'Expired requests cron')
  .catch(async (error) => {
    console.error('❌ Cron timeout or fatal error:', error);
    try { await getPrismaClient().$disconnect(); } catch (e) { }
    process.exit(1);
  });
