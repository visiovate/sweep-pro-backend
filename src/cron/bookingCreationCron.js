/**
 * Booking Creation Cron Job
 * 
 * Creates daily bookings from active subscriptions.
 * This is the missing "Step 1" of the pipeline:
 *   1. [THIS CRON] Create bookings for tomorrow
 *   2. assignmentCron → finds bookings and enqueues assignment jobs
 *   3. assignmentWorker → creates assignment requests for maids
 *
 * For each ACTIVE subscription:
 *   - Check if tomorrow is a service day (3x/week = Mon/Wed/Fri, 6x/week = all except maid off day)
 *   - Skip if paused, in buffer, or booking already exists
 *   - Parse customer's timeSlot to populate scheduledAt, slot_date, slot_time
 *   - Find the assigned maid via CustomerMaidAssignment
 *   - Create the Booking record
 *
 * Usage: node src/cron/bookingCreationCron.js
 */

require('dotenv').config();

const { initializePrisma, getPrismaClient } = require('../utils/database');
const { retryPrismaOperation, withTimeout } = require('../utils/retryUtils');

const CRON_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

// ─── Helpers ──────────────────────────────────────────────────────────

const WEEKDAY_MAP = {
    SUNDAY: 0, MONDAY: 1, TUESDAY: 2, WEDNESDAY: 3,
    THURSDAY: 4, FRIDAY: 5, SATURDAY: 6,
};
const DAY_NAMES = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];

/**
 * Return the set of JS day-of-week numbers (0-6) on which service happens.
 */
function getServiceDays(sessionsPerWeek, maidWeeklyOff) {
    if (sessionsPerWeek === 3) {
        // Mon, Wed, Fri
        return new Set([1, 3, 5]);
    }
    if (sessionsPerWeek === 6) {
        // All except maid's weekly off (default Sunday)
        const offDay = maidWeeklyOff ? WEEKDAY_MAP[maidWeeklyOff] : 0;
        return new Set([0, 1, 2, 3, 4, 5, 6].filter(d => d !== offDay));
    }
    // Default: every day
    return new Set([0, 1, 2, 3, 4, 5, 6]);
}

/**
 * Parse a customer timeSlot string like "06:00 - 08:00" or "09:00-12:00"
 * Returns { startHour, startMinute } or defaults { 9, 0 }.
 */
function parseTimeSlot(timeSlot) {
    if (!timeSlot) return { startHour: 9, startMinute: 0 };

    // Normalize: remove spaces around dash
    const cleaned = timeSlot.replace(/\s+/g, '');
    // e.g. "06:00-08:00"
    const match = cleaned.match(/^(\d{1,2}):(\d{2})/);
    if (match) {
        return { startHour: parseInt(match[1], 10), startMinute: parseInt(match[2], 10) };
    }
    return { startHour: 9, startMinute: 0 };
}

/**
 * Build a UTC Date for a given local (IST) date + time.
 * IST is UTC+5:30, so we subtract 5h30m from local time to get UTC.
 */
function buildScheduledAtIST(dateObj, hour, minute) {
    const year = dateObj.getFullYear();
    const month = dateObj.getMonth();
    const day = dateObj.getDate();

    // Create the date as if it were local IST, then offset to UTC
    // IST = UTC + 5:30  →  UTC = IST - 5:30
    const istDate = new Date(Date.UTC(year, month, day, hour, minute, 0));
    istDate.setUTCHours(istDate.getUTCHours() - 5);
    istDate.setUTCMinutes(istDate.getUTCMinutes() - 30);
    return istDate;
}

// ─── Main Logic ──────────────────────────────────────────────────────

async function createBookingsForTomorrow() {
    const prisma = getPrismaClient();

    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);

    const dayOfWeek = tomorrow.getDay();
    console.log(`📆 Creating bookings for tomorrow: ${tomorrow.toISOString().slice(0, 10)} (${DAY_NAMES[dayOfWeek]})`);

    // 1. Fetch all active subscriptions with relevant relations
    const subscriptions = await retryPrismaOperation(
        () => prisma.subscription.findMany({
            where: {
                status: 'ACTIVE',
                isPaused: false,
                isInBufferPeriod: false,
                // Ensure subscription is still within its period
                startDate: { lte: tomorrow },
                endDate: { gte: tomorrow },
            },
            include: {
                customer: {
                    include: {
                        user: {
                            select: {
                                id: true,
                                name: true,
                                email: true,
                                timeSlot: true,
                                address: true,
                                latitude: true,
                                longitude: true,
                            },
                        },
                    },
                },
                plan: {
                    include: {
                        service: { select: { id: true, name: true, baseDuration: true } },
                    },
                },
            },
        }),
        'Fetch active subscriptions'
    );

    console.log(`📋 Found ${subscriptions.length} active subscription(s)\n`);

    let stats = { created: 0, skippedNotServiceDay: 0, skippedExists: 0, skippedNoSlot: 0, errors: 0 };

    for (const sub of subscriptions) {
        const user = sub.customer.user;
        const plan = sub.plan;
        const service = plan.service;

        // 2. Find the customer's assigned maid
        const assignment = await prisma.customerMaidAssignment.findFirst({
            where: { customerId: user.id, isActive: true },
            include: { maid: { select: { userId: true, weeklyOffDay: true, user: { select: { name: true } } } } },
        });

        const maidWeeklyOff = assignment?.maid?.weeklyOffDay || null;
        const maidUserId = assignment?.maid?.userId || null;

        // 3. Check if tomorrow is a service day
        const serviceDays = getServiceDays(plan.sessionsPerWeek, maidWeeklyOff);
        if (!serviceDays.has(dayOfWeek)) {
            const reason = maidWeeklyOff && dayOfWeek === WEEKDAY_MAP[maidWeeklyOff]
                ? `maid's off day (${maidWeeklyOff})`
                : `not a service day for ${plan.sessionsPerWeek}x/week plan`;
            console.log(`  ⏭️  ${user.name} — skip: ${reason}`);
            stats.skippedNotServiceDay++;
            continue;
        }

        // 4. Check if booking already exists for tomorrow
        const tomorrowStart = new Date(tomorrow);
        const tomorrowEnd = new Date(tomorrow);
        tomorrowEnd.setHours(23, 59, 59, 999);

        const exists = await prisma.booking.findFirst({
            where: {
                customerId: user.id,
                scheduledAt: { gte: tomorrowStart, lte: tomorrowEnd },
                status: { not: 'CANCELLED' },
            },
        });

        if (exists) {
            console.log(`  📋 ${user.name} — skip: booking already exists (${exists.id.slice(0, 8)}...)`);
            stats.skippedExists++;
            continue;
        }

        // 5. Check if tomorrow falls within a buffer period
        const bufferPeriod = await prisma.bufferPeriod.findFirst({
            where: {
                subscriptionId: sub.id,
                status: 'ACTIVE',
                startDate: { lte: tomorrow },
                endDate: { gte: tomorrow },
            },
        });

        if (bufferPeriod) {
            console.log(`  🛡️  ${user.name} — skip: in buffer period`);
            stats.skippedNotServiceDay++;
            continue;
        }

        // 6. Parse timeslot and build scheduled datetime
        const { startHour, startMinute } = parseTimeSlot(user.timeSlot);
        const scheduledAt = buildScheduledAtIST(tomorrow, startHour, startMinute);

        // Build slot_date (just date) and slot_time (just time)
        // slot_date: tomorrow at midnight UTC
        const slotDate = new Date(Date.UTC(tomorrow.getFullYear(), tomorrow.getMonth(), tomorrow.getDate()));
        // slot_time: time-only as a Date (Prisma @db.Time stores this as a Date)
        const slotTime = new Date(Date.UTC(1970, 0, 1, startHour, startMinute, 0));

        // 7. Create the booking
        try {
            const booking = await prisma.booking.create({
                data: {
                    customerId: user.id,
                    maidId: maidUserId,
                    serviceId: service.id,
                    status: maidUserId ? 'CONFIRMED' : 'PENDING',
                    priority: 'NORMAL',
                    scheduledAt,
                    slot_date: slotDate,
                    slot_time: slotTime,
                    assignment_sent: false,
                    estimatedDuration: service.baseDuration || 60,
                    serviceAddress: user.address || '',
                    serviceLatitude: user.latitude,
                    serviceLongitude: user.longitude,
                    totalAmount: 0,
                    discount: 0,
                    finalAmount: 0,
                    isSubscriptionBased: true,
                    isAutomatic: true,
                    isBufferSkipped: false,
                    timeSlot: user.timeSlot || null,
                    assignmentStatus: 'PENDING_ASSIGNMENT',
                    specialInstructions: `Auto-generated from ${plan.name} subscription`,
                },
            });

            const slotLabel = user.timeSlot || `default ${startHour}:${String(startMinute).padStart(2, '0')}`;
            const maidLabel = assignment ? assignment.maid.user.name : 'NO MAID';
            console.log(`  ✅ ${user.name} — created booking (slot: ${slotLabel}, maid: ${maidLabel}, id: ${booking.id.slice(0, 8)}...)`);
            stats.created++;
        } catch (error) {
            console.error(`  ❌ ${user.name} — failed: ${error.message}`);
            stats.errors++;
        }
    }

    return stats;
}

// ─── Exports (for use by assignmentCron.js) ─────────────────────────
module.exports = { createBookingsForTomorrow };

// ─── Standalone Entrypoint ───────────────────────────────────────────
// Only runs when executed directly (not when imported)

if (require.main === module) {
    async function runCron() {
        const startTime = Date.now();
        console.log('\n═══════════════════════════════════════════════════════');
        console.log('║   📅 BOOKING CREATION CRON JOB');
        console.log(`║   Started: ${new Date().toISOString()}`);
        console.log('═══════════════════════════════════════════════════════\n');

        try {
            await initializePrisma();
            const stats = await createBookingsForTomorrow();

            const duration = Date.now() - startTime;
            console.log('\n═══════════════════════════════════════════════════════');
            console.log('║   ✅ CRON JOB COMPLETED');
            console.log(`║   Duration: ${duration}ms`);
            console.log(`║   Created: ${stats.created}`);
            console.log(`║   Skipped (not service day): ${stats.skippedNotServiceDay}`);
            console.log(`║   Skipped (already exists): ${stats.skippedExists}`);
            console.log(`║   Errors: ${stats.errors}`);
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
            console.error(error.stack);

            try { await getPrismaClient().$disconnect(); } catch { }
            process.exit(1);
        }
    }

    process.on('SIGTERM', async () => {
        try { await getPrismaClient().$disconnect(); } catch { }
        process.exit(143);
    });

    process.on('SIGINT', async () => {
        try { await getPrismaClient().$disconnect(); } catch { }
        process.exit(130);
    });

    withTimeout(() => runCron(), CRON_TIMEOUT_MS, 'Booking creation cron')
        .catch(async (error) => {
            console.error('❌ Cron timeout or fatal error:', error);
            try { await getPrismaClient().$disconnect(); } catch { }
            process.exit(1);
        });
}

