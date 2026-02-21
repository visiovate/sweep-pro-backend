/**
 * Assignment Cron Job - Production Ready
 * 
 * This cron job:
 * 1. Runs once and exits (no loops)
 * 2. Queries DB for bookings needing assignment requests (20h before slot)
 * 3. Enqueues jobs into BullMQ worker queue
 * 4. Handles DB/Redis errors with proper exit codes
 * 5. Ensures idempotency via DB transactions
 * 
 * Deploy on Render as cron job:
 */


const { initializePrisma, getPrismaClient } = require('../utils/database');
const { Queue } = require('bullmq');
const { createRedisConnection, closeRedisConnection } = require('../config/redis');
const { retryPrismaOperation, retryRedisOperation, withTimeout } = require('../utils/retryUtils');
const {
  combineSlotDateTime,
  getCurrentUTC,
  get20HourTriggerWindow,
  formatDateTimeForLog,
} = require('../utils/timeUtils');

// Constants
const CRON_TIMEOUT_MS = 4 * 60 * 1000; // 4 minutes max runtime
const BATCH_SIZE = 100; // Process bookings in batches

// Initialize Prisma
// Initialize using singleton pattern
// Log configured in initializePrisma
// Initialization done by initializePrisma()

let redisConnection = null;
let assignmentQueue = null;

/**
 * Initialize Redis connection and queue
 */
async function initializeQueue() {
  console.log('🔌 Connecting to Redis...');

  redisConnection = await retryRedisOperation(
    () => createRedisConnection(),
    'Redis connection'
  );

  assignmentQueue = new Queue('maid-assignment', {
    connection: redisConnection,
  });

  console.log('✅ Redis connected, queue initialized');
}

/**
 * Find bookings that need assignment requests
 * Criteria:
 * - Service datetime is within the next 20 hours
 * - assignment_sent = false
 * - status is PENDING or CONFIRMED
 * - maidId is null (not yet assigned)
 */
async function findBookingsNeedingAssignment() {
  const now = getCurrentUTC();
  const { windowStart, windowEnd } = get20HourTriggerWindow(now);

  console.log(`📅 Trigger window (now to 20h ahead):`);
  console.log(`   Start: ${formatDateTimeForLog(windowStart)}`);
  console.log(`   End:   ${formatDateTimeForLog(windowEnd)}`);

  // Fetch all eligible bookings (we'll filter combined datetime in JS for simplicity)
  const bookings = await retryPrismaOperation(
    () => getPrismaClient().booking.findMany({
      where: {
        assignment_sent: false,
        status: {
          in: ['PENDING', 'CONFIRMED'],
        },
        maidId: null,
      },
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            email: true,
            customerProfile: {
              select: {
                subscription: {
                  select: {
                    id: true,
                    isInBufferPeriod: true,
                  },
                },
              },
            },
          },
        },
        service: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      take: BATCH_SIZE,
      orderBy: {
        scheduledAt: 'asc',
      },
    }),
    'Find eligible bookings'
  );

  // Filter bookings by combined slot_date + slot_time within trigger window
  const eligibleBookings = bookings.filter(booking => {
    // Combine slot_date + slot_time
    const serviceDateTime = combineSlotDateTime(booking.slot_date, booking.slot_time) ||
      booking.scheduledAt;

    // Check if within trigger window
    const isEligible = serviceDateTime >= windowStart && serviceDateTime <= windowEnd;

    if (!isEligible && booking.slot_date && booking.slot_time) {
      console.log(
        `⏭️  Booking ${booking.id}: service at ${formatDateTimeForLog(serviceDateTime)} ` +
        `is outside trigger window`
      );
    }

    return isEligible;
  });

  console.log(`📋 Found ${eligibleBookings.length} booking(s) in trigger window`);
  return eligibleBookings;
}

/**
 * Enqueue assignment job for a booking
 * 
 * FIX #1: Enqueue FIRST (idempotent jobId = bookingId)
 * Worker will mark assignment_sent inside transaction after successful creation
 * 
 * This removes distributed transactions and prevents lost assignments
 */
async function enqueueAssignmentJob(booking, prisma) {
  const { id: bookingId, customerId, customer, service, scheduledAt } = booking;

  // Skip if customer is in buffer period (subscription-level flag)
  if (customer?.customerProfile?.subscription?.isInBufferPeriod) {
    console.log(`⏸️  Skipping booking ${bookingId}: customer in buffer period`);
    return { skipped: true, reason: 'buffer_period' };
  }

  // Also check if the specific booking date falls within a buffer period
  if (customer?.customerProfile?.subscription) {
    const subscriptionId = customer.customerProfile.subscription.id;
    const bookingDate = new Date(scheduledAt);

    const bufferPeriodForDate = await getPrismaClient().bufferPeriod.findFirst({
      where: {
        subscriptionId,
        status: 'ACTIVE',
        startDate: { lte: bookingDate },
        endDate: { gte: bookingDate }
      }
    });

    if (bufferPeriodForDate) {
      console.log(`⏸️  Skipping booking ${bookingId}: booking date falls in buffer period`);
      return { skipped: true, reason: 'buffer_period_date' };
    }
  }

  try {
    // Enqueue job with idempotent jobId (booking ID)
    const jobId = `assignment-booking-${bookingId}`;

    await retryRedisOperation(
      () => assignmentQueue.add(
        'create-assignment-request',
        {
          bookingId,
          customerId,
          customerName: customer?.name || 'Customer',
          serviceId: service?.id,
          serviceName: service?.name || 'Service',
          scheduledAt: booking.scheduledAt?.toISOString(),
          slot_date: booking.slot_date?.toISOString(),
          slot_time: booking.slot_time,
        },
        {
          jobId, // Idempotent key - prevents duplicate queuing
          removeOnComplete: {
            count: 100,
            age: 24 * 3600,
          },
          removeOnFail: {
            count: 50,
            age: 7 * 24 * 3600,
          },
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 5000,
          },
        }
      ),
      `Enqueue job for booking ${bookingId}`
    );

    console.log(`✅ Enqueued assignment job for booking ${bookingId}`);
    return { enqueued: true };

  } catch (error) {
    console.error(`❌ Failed to enqueue booking ${bookingId}:`, error.message);
    throw error;
  }
}

/**
 * Main cron execution
 */
async function runCron() {
  const startTime = Date.now();
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('║   🤖 ASSIGNMENT CRON JOB');
  console.log(`║   Started: ${new Date().toISOString()}`);
  console.log('═══════════════════════════════════════════════════════\n');

  let stats = {
    found: 0,
    enqueued: 0,
    skipped: 0,
    errors: 0,
  };

  try {
    // Initialize Prisma database connection
    await initializePrisma();
    // Initialize connections
    await initializeQueue();

    // Find bookings
    const bookings = await findBookingsNeedingAssignment();
    stats.found = bookings.length;

    // Process each booking
    // FIX: `prisma` was never declared in this file — use getPrismaClient() instead
    for (const booking of bookings) {
      try {
        const result = await enqueueAssignmentJob(booking, getPrismaClient());

        if (result.skipped) {
          stats.skipped++;
        } else if (result.enqueued) {
          stats.enqueued++;
        }
      } catch (error) {
        stats.errors++;
        console.error(`❌ Error processing booking ${booking.id}:`, error.message);
      }
    }

    const duration = Date.now() - startTime;
    console.log('\n═══════════════════════════════════════════════════════');
    console.log('║   ✅ CRON JOB COMPLETED');
    console.log(`║   Duration: ${duration}ms`);
    console.log(`║   Found: ${stats.found}`);
    console.log(`║   Enqueued: ${stats.enqueued}`);
    console.log(`║   Skipped: ${stats.skipped}`);
    console.log(`║   Errors: ${stats.errors}`);
    console.log('═══════════════════════════════════════════════════════\n');

    await cleanup();
    process.exit(0); // Success

  } catch (error) {
    const duration = Date.now() - startTime;
    console.error('\n═══════════════════════════════════════════════════════');
    console.error('║   ❌ CRON JOB FAILED');
    console.error(`║   Duration: ${duration}ms`);
    console.error(`║   Error: ${error.message}`);
    console.error('═══════════════════════════════════════════════════════\n');
    console.error(error.stack);

    await cleanup();
    process.exit(1); // Failure
  }
}

/**
 * Cleanup connections
 */
async function cleanup() {
  console.log('🧹 Cleaning up connections...');

  try {
    if (assignmentQueue) {
      await assignmentQueue.close();
    }
  } catch (error) {
    console.warn('⚠️  Failed to close queue:', error.message);
  }

  try {
    if (redisConnection) {
      await closeRedisConnection(redisConnection);
    }
  } catch (error) {
    console.warn('⚠️  Failed to close Redis:', error.message);
  }

  try {
    await getPrismaClient().$disconnect();
  } catch (error) {
    console.warn('⚠️  Failed to disconnect Prisma:', error.message);
  }

  console.log('✅ Cleanup complete');
}

/**
 * Handle process signals
 * C5 FIX: All four signal handlers were missing their closing `});`
 * which caused a SyntaxError that prevented the cron from ever loading.
 */
process.on('SIGTERM', async () => {
  console.log('⚠️  SIGTERM received, shutting down...');
  await cleanup();
  process.exit(143); // 128 + 15 (SIGTERM)
});

process.on('SIGINT', async () => {
  console.log('⚠️  SIGINT received, shutting down...');
  await cleanup();
  process.exit(130); // 128 + 2 (SIGINT)
});

process.on('unhandledRejection', async (reason, promise) => {
  console.error('❌ Unhandled Rejection:', reason);
  await cleanup();
  process.exit(1);
});

process.on('uncaughtException', async (error) => {
  console.error('❌ Uncaught Exception:', error);
  await cleanup();
  process.exit(1);
});

// Run with timeout
withTimeout(() => runCron(), CRON_TIMEOUT_MS, 'Cron job')
  .catch(async (error) => {
    console.error('❌ Cron timeout or fatal error:', error);
    await cleanup();
    process.exit(1);
  });
