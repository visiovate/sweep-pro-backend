const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const prisma = new PrismaClient();

async function main() {
    const email = 'lux.bungalow@sweepro.com';
    const user = await prisma.user.findUnique({ where: { email } });

    const booking = await prisma.booking.findFirst({
        where: { customerId: user.id },
        orderBy: { scheduledAt: 'desc' }
    });

    if (!booking) {
        console.log('No booking found');
        return;
    }

    // Manually fetch maid for booking if any
    let bookingMaid = null;
    if (booking.maidId) {
        const maidUser = await prisma.user.findUnique({ where: { id: booking.maidId } });
        bookingMaid = maidUser ? maidUser.name : 'Unknown User';
    }

    // Fetch Assignment Requests
    const requests = await prisma.assignmentRequest.findMany({
        where: { bookingId: booking.id }
    });

    const fullRequests = [];
    for (const r of requests) {
        const maidProfile = await prisma.maidProfile.findUnique({ where: { id: r.maidId } });
        const maidUser = maidProfile ? await prisma.user.findUnique({ where: { id: maidProfile.userId } }) : null;
        fullRequests.push({
            id: r.id,
            status: r.status,
            maidName: maidUser ? maidUser.name : 'Unknown',
            maidId: r.maidId
        });
    }

    const result = {
        bookingId: booking.id,
        date: booking.scheduledAt,
        isAuto: booking.isAutomatic,
        assignedMaidId: booking.maidId,
        assignedMaidName: bookingMaid,
        requests: fullRequests
    };

    fs.writeFileSync('debug-booking-manual.json', JSON.stringify(result, null, 2));
    console.log('Done mapping manually');
}

main().catch(console.error).finally(() => prisma.$disconnect());
