const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
const fs = require('fs');

(async () => {
    try {
        let out = '';

        // 1. All PENDING/CONFIRMED bookings
        const bookings = await p.booking.findMany({
            where: { status: { in: ['PENDING', 'CONFIRMED'] } },
            select: {
                id: true, scheduledAt: true, slot_date: true, slot_time: true,
                status: true, assignmentStatus: true, assignment_sent: true, maidId: true,
            },
            orderBy: { scheduledAt: 'desc' },
            take: 20,
        });

        out += '=== PENDING/CONFIRMED BOOKINGS ===\n';
        for (const b of bookings) {
            out += JSON.stringify({
                id: b.id.substring(0, 8),
                scheduledAt: b.scheduledAt?.toISOString(),
                slot_date: b.slot_date?.toISOString(),
                slot_time: b.slot_time,
                status: b.status,
                asgStatus: b.assignmentStatus,
                sent: b.assignment_sent,
                maid: b.maidId ? b.maidId.substring(0, 8) : null,
            }) + '\n';
        }
        out += 'Total: ' + bookings.length + '\n\n';

        // 2. Pending assignment requests
        const reqs = await p.assignmentRequest.findMany({
            where: { status: 'pending' },
            select: { id: true, bookingId: true, maidId: true, expiresAt: true },
            take: 10,
        });

        out += '=== PENDING ASSIGNMENT REQUESTS ===\n';
        out += 'Count: ' + reqs.length + '\n';
        for (const r of reqs) {
            out += JSON.stringify({
                id: r.id.substring(0, 8),
                booking: r.bookingId.substring(0, 8),
                maid: r.maidId.substring(0, 8),
                expires: r.expiresAt?.toISOString(),
            }) + '\n';
        }

        // 3. Current time
        out += '\nCurrent UTC: ' + new Date().toISOString() + '\n';

        fs.writeFileSync('scripts/db-state.txt', out, 'utf8');
        console.log('Done');
    } catch (e) {
        console.error(e.message);
    } finally {
        await p.$disconnect();
    }
})();
