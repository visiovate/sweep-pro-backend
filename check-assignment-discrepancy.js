const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const email = 'lux.bungalow@sweepro.com';

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return console.log('User not found!');

    console.log(`User ID: ${user.id}`);

    const assignments = await prisma.customerMaidAssignment.findMany({
        where: { customerId: user.id, isActive: true }
    });

    console.log('\n--- Active Assignments ---');
    for (const a of assignments) {
        const maid = await prisma.maidProfile.findUnique({ where: { id: a.maidId }, include: { user: true } });
        console.log(`Maid Assigned: ${maid?.user?.name || 'Unknown'} (Maid ID: ${a.maidId})`);
    }

    const bookings = await prisma.booking.findMany({
        where: { customerId: user.id },
        orderBy: { scheduledAt: 'desc' },
        take: 5
    });

    console.log('\n--- Recent Bookings ---');
    for (const b of bookings) {
        let maidName = 'Unassigned';
        if (b.maidId) {
            const m = await prisma.maidProfile.findUnique({ where: { id: b.maidId }, include: { user: true } });
            maidName = m?.user?.name || 'Unknown';
        }
        console.log(`Booking ID: ${b.id} | Date: ${b.scheduledAt.toISOString()} | isAuto: ${b.isAutomatic} | Maid: ${maidName}`);
    }

}

main().catch(console.error).finally(() => prisma.$disconnect());
