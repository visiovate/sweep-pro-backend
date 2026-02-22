#!/usr/bin/env node
/**
 * Booking Diagnostics Script
 * ===========================
 * Tests and displays:
 * 1. All customer–maid assignments (active and inactive)
 * 2. Customer time-slots and how the cron interprets them
 * 3. All future/upcoming bookings with status
 * 4. Time remaining until each customer's next booking
 * 5. Assignment request flow (sent / accepted / pending)
 * 6. Subscription status overview
 *
 * Usage:  node scripts/test-booking-diagnostics.js
 */

require('dotenv').config();

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient({ log: ['error'] });

// ─── helpers ──────────────────────────────────────────────────────────
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000; // UTC+5:30

function toIST(date) {
    if (!date) return 'N/A';
    const d = new Date(date);
    return new Date(d.getTime() + IST_OFFSET_MS).toISOString().replace('T', ' ').slice(0, 19) + ' IST';
}

function timeUntil(targetDate) {
    if (!targetDate) return 'N/A';
    const now = new Date();
    const diff = new Date(targetDate).getTime() - now.getTime();
    if (diff <= 0) return '⏰ PAST / NOW';
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    return `${hours}h ${mins}m`;
}

function header(title) {
    const line = '═'.repeat(60);
    console.log(`\n${line}`);
    console.log(`  ${title}`);
    console.log(line);
}

// ─── 1. Customer ↔ Maid Assignments ──────────────────────────────────
async function showAssignments() {
    header('1. CUSTOMER–MAID ASSIGNMENTS');

    const assignments = await prisma.customerMaidAssignment.findMany({
        include: {
            customer: { select: { id: true, name: true, email: true, timeSlot: true, role: true } },
            maid: {
                select: {
                    userId: true,
                    status: true,
                    weeklyOffDay: true,
                    user: { select: { name: true, email: true } }
                }
            }
        },
        orderBy: { isActive: 'desc' }
    });

    if (assignments.length === 0) {
        console.log('  ❌ No customer–maid assignments found.');
        return;
    }

    for (const a of assignments) {
        const status = a.isActive ? '✅ ACTIVE' : '❌ INACTIVE';
        console.log(`\n  ${status}`);
        console.log(`    Customer : ${a.customer.name} <${a.customer.email}>`);
        console.log(`    Maid     : ${a.maid.user.name} <${a.maid.user.email}> (status: ${a.maid.status})`);
        console.log(`    Time-slot: ${a.customer.timeSlot || '⚠️  NOT SET'}`);
        console.log(`    Maid off : ${a.maid.weeklyOffDay || 'NOT SET'}`);
        console.log(`    Assigned : ${toIST(a.assignedAt)}`);
        if (a.notes) console.log(`    Notes    : ${a.notes}`);
    }
}

// ─── 2. Time-slot Overview ──────────────────────────────────────────
async function showTimeSlots() {
    header('2. CUSTOMER TIME-SLOTS');

    const customers = await prisma.user.findMany({
        where: { role: 'CUSTOMER' },
        select: { id: true, name: true, email: true, timeSlot: true, status: true },
        orderBy: { name: 'asc' }
    });

    if (customers.length === 0) {
        console.log('  No customers found.');
        return;
    }

    console.log(`  Total customers: ${customers.length}\n`);

    const slotCounts = {};
    for (const c of customers) {
        const slot = c.timeSlot || '⚠️  NOT SET';
        slotCounts[slot] = (slotCounts[slot] || 0) + 1;
        console.log(`  ${c.name.padEnd(25)} | ${slot.padEnd(18)} | status: ${c.status}`);
    }

    console.log('\n  ── Slot distribution ──');
    for (const [slot, count] of Object.entries(slotCounts).sort()) {
        console.log(`    ${slot.padEnd(20)} → ${count} customer(s)`);
    }

    // Also check TimeSlotBooking table
    const tsBookings = await prisma.timeSlotBooking.findMany({ orderBy: { timeSlot: 'asc' } });
    if (tsBookings.length > 0) {
        console.log('\n  ── TimeSlotBooking table ──');
        for (const ts of tsBookings) {
            console.log(`    ${ts.timeSlot.padEnd(20)} → ${ts.count}/${ts.maxLimit} booked`);
        }
    }
}

// ─── 3. Upcoming Bookings ───────────────────────────────────────────
async function showUpcomingBookings() {
    header('3. ALL BOOKINGS (last 30 days → next 7 days)');

    const now = new Date();
    const past30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const future7 = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const bookings = await prisma.booking.findMany({
        where: {
            scheduledAt: { gte: past30, lte: future7 }
        },
        include: {
            customer: { select: { name: true, email: true, timeSlot: true } },
            maid: { select: { name: true, email: true } },
            service: { select: { name: true } }
        },
        orderBy: { scheduledAt: 'asc' }
    });

    if (bookings.length === 0) {
        console.log('  ❌ No bookings found in this range.');

        // Check if there are ANY bookings at all
        const totalBookings = await prisma.booking.count();
        const oldestBooking = await prisma.booking.findFirst({ orderBy: { scheduledAt: 'asc' } });
        const newestBooking = await prisma.booking.findFirst({ orderBy: { scheduledAt: 'desc' } });

        console.log(`\n  Total bookings in DB: ${totalBookings}`);
        if (oldestBooking) console.log(`  Oldest booking: ${toIST(oldestBooking.scheduledAt)} (status: ${oldestBooking.status})`);
        if (newestBooking) console.log(`  Newest booking: ${toIST(newestBooking.scheduledAt)} (status: ${newestBooking.status})`);
        return;
    }

    console.log(`  Found ${bookings.length} booking(s)\n`);

    for (const b of bookings) {
        const isPast = new Date(b.scheduledAt) < now;
        const marker = isPast ? '⬛' : '🟢';
        console.log(`  ${marker} ${toIST(b.scheduledAt)}`);
        console.log(`     ID               : ${b.id}`);
        console.log(`     Customer          : ${b.customer.name} (slot: ${b.customer.timeSlot || 'N/A'})`);
        console.log(`     Maid              : ${b.maid?.name || '⚠️  UNASSIGNED'}`);
        console.log(`     Service           : ${b.service.name}`);
        console.log(`     Status            : ${b.status}`);
        console.log(`     Assignment Status : ${b.assignmentStatus || 'N/A'}`);
        console.log(`     Assignment Sent   : ${b.assignment_sent ? `✅ at ${toIST(b.assignment_sent_at)}` : '❌ NO'}`);
        console.log(`     Time remaining    : ${timeUntil(b.scheduledAt)}`);
        console.log(`     Subscription-based: ${b.isSubscriptionBased ? 'Yes' : 'No'}`);
        console.log(`     Automatic         : ${b.isAutomatic ? 'Yes' : 'No'}`);
        console.log();
    }
}

// ─── 4. Per-customer Next-booking Summary ───────────────────────────
async function showNextBookingPerCustomer() {
    header('4. NEXT BOOKING PER CUSTOMER');

    const now = new Date();
    const customers = await prisma.user.findMany({
        where: { role: 'CUSTOMER' },
        select: { id: true, name: true, email: true, timeSlot: true }
    });

    if (customers.length === 0) {
        console.log('  No customers found.');
        return;
    }

    for (const c of customers) {
        const nextBooking = await prisma.booking.findFirst({
            where: {
                customerId: c.id,
                scheduledAt: { gte: now },
                status: { not: 'CANCELLED' }
            },
            include: {
                maid: { select: { name: true } },
                service: { select: { name: true } }
            },
            orderBy: { scheduledAt: 'asc' }
        });

        if (nextBooking) {
            console.log(`\n  ✅ ${c.name} <${c.email}>`);
            console.log(`     Slot      : ${c.timeSlot || 'N/A'}`);
            console.log(`     Next      : ${toIST(nextBooking.scheduledAt)}`);
            console.log(`     Status    : ${nextBooking.status} (assignment: ${nextBooking.assignmentStatus || 'N/A'})`);
            console.log(`     Service   : ${nextBooking.service.name}`);
            console.log(`     Maid      : ${nextBooking.maid?.name || '⚠️  UNASSIGNED'}`);
            console.log(`     Remaining : ${timeUntil(nextBooking.scheduledAt)}`);
        } else {
            console.log(`\n  ❌ ${c.name} <${c.email}>`);
            console.log(`     Slot      : ${c.timeSlot || 'N/A'}`);
            console.log(`     Next      : NO UPCOMING BOOKING`);
        }
    }
}

// ─── 5. Assignment Requests ─────────────────────────────────────────
async function showAssignmentRequests() {
    header('5. ASSIGNMENT REQUESTS (latest 20)');

    const requests = await prisma.assignmentRequest.findMany({
        take: 20,
        orderBy: { createdAt: 'desc' },
        include: {
            booking: {
                select: {
                    id: true, scheduledAt: true, status: true, assignmentStatus: true,
                    customer: { select: { name: true } }
                }
            },
            maid: {
                select: { user: { select: { name: true } } }
            }
        }
    });

    if (requests.length === 0) {
        console.log('  No assignment requests found.');
        return;
    }

    for (const r of requests) {
        console.log(`\n  📨 Request ${r.id.slice(0, 8)}...`);
        console.log(`     Status   : ${r.status}`);
        console.log(`     Customer : ${r.booking.customer.name}`);
        console.log(`     Maid     : ${r.maid.user.name}`);
        console.log(`     Booking  : ${toIST(r.booking.scheduledAt)} (${r.booking.status})`);
        console.log(`     Sent     : ${toIST(r.createdAt)}`);
        if (r.respondedAt) console.log(`     Responded: ${toIST(r.respondedAt)}`);
        if (r.expiresAt) console.log(`     Expires  : ${toIST(r.expiresAt)}`);
    }
}

// ─── 6. Subscription Status ─────────────────────────────────────────
async function showSubscriptions() {
    header('6. SUBSCRIPTIONS');

    const subs = await prisma.subscription.findMany({
        include: {
            customer: {
                include: { user: { select: { name: true, email: true, timeSlot: true } } }
            },
            plan: { select: { name: true, sessionsPerWeek: true, sessionsPerMonth: true } }
        },
        orderBy: { status: 'asc' }
    });

    if (subs.length === 0) {
        console.log('  No subscriptions found.');
        return;
    }

    for (const s of subs) {
        const statusEmoji = s.status === 'ACTIVE' ? '✅' : s.status === 'CANCELLED' ? '❌' : '⚠️ ';
        console.log(`\n  ${statusEmoji} ${s.customer.user.name} <${s.customer.user.email}>`);
        console.log(`     Plan        : ${s.plan.name} (${s.plan.sessionsPerWeek}x/week)`);
        console.log(`     Status      : ${s.status}`);
        console.log(`     Time-slot   : ${s.customer.user.timeSlot || '⚠️  NOT SET'}`);
        console.log(`     Period      : ${toIST(s.startDate)} → ${toIST(s.endDate)}`);
        console.log(`     Paused      : ${s.isPaused ? `YES (since ${toIST(s.pausedAt)})` : 'No'}`);
        console.log(`     Buffer      : ${s.isInBufferPeriod ? 'IN BUFFER' : 'Normal'} (${s.bufferDaysUsed}/${s.bufferDaysCount} used)`);
        console.log(`     Auto-renew  : ${s.autoRenew ? 'Yes' : 'No'}`);
    }
}

// ─── 7. Cron Trigger Window Check ───────────────────────────────────
async function showCronTriggerWindow() {
    header('7. CRON TRIGGER WINDOW CHECK');

    const now = new Date();
    const lookAhead = new Date(now.getTime() + 20 * 60 * 60 * 1000); // 20h ahead

    console.log(`  Current time (UTC)  : ${now.toISOString()}`);
    console.log(`  Current time (IST)  : ${toIST(now)}`);
    console.log(`  Trigger window end  : ${toIST(lookAhead)}`);
    console.log();

    // Check what the cron would find
    const bookingsInWindow = await prisma.booking.findMany({
        where: {
            scheduledAt: { gte: now, lte: lookAhead },
            status: { in: ['CONFIRMED', 'ASSIGNED', 'PENDING'] },
            assignment_sent: false
        },
        include: {
            customer: { select: { name: true, timeSlot: true } },
            maid: { select: { name: true } }
        },
        orderBy: { scheduledAt: 'asc' }
    });

    if (bookingsInWindow.length === 0) {
        console.log('  ❌ No bookings found in trigger window (assignment not yet sent).');
        console.log('     This means the cron will have nothing to process.');
        console.log('     Possible causes:');
        console.log('       • No bookings have been created for today/tomorrow');
        console.log('       • All bookings already have assignment_sent = true');
        console.log('       • Bookings are in the past (scheduledAt < now)');
    } else {
        console.log(`  ✅ Found ${bookingsInWindow.length} booking(s) in trigger window:\n`);
        for (const b of bookingsInWindow) {
            console.log(`    🕐 ${toIST(b.scheduledAt)} | ${b.customer.name} | slot: ${b.customer.timeSlot || 'N/A'} | maid: ${b.maid?.name || 'NONE'}`);
        }
    }
}

// ─── Main ───────────────────────────────────────────────────────────
async function main() {
    console.log('\n🔍 SWEEPRO BOOKING DIAGNOSTICS');
    console.log(`   Run at: ${toIST(new Date())}\n`);

    try {
        await prisma.$connect();
        console.log('   ✅ Database connected\n');

        await showAssignments();
        await showTimeSlots();
        await showUpcomingBookings();
        await showNextBookingPerCustomer();
        await showAssignmentRequests();
        await showSubscriptions();
        await showCronTriggerWindow();

        header('DIAGNOSTICS COMPLETE');
    } catch (error) {
        console.error('\n❌ Diagnostics failed:', error.message);
        console.error(error.stack);
    } finally {
        await prisma.$disconnect();
    }
}

main();
