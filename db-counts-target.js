const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const targetDateStr = '2026-03-07';
    const start = new Date(`${targetDateStr}T00:00:00.000Z`);
    const end = new Date(`${targetDateStr}T23:59:59.999Z`);

    const allBookings = await prisma.booking.findMany();

    const targetBookings = allBookings.filter(b => b.scheduledAt >= start && b.scheduledAt <= end);
    const autoTargetBookings = targetBookings.filter(b => b.isAutomatic);
    const autoAllBookings = allBookings.filter(b => b.isAutomatic);

    console.log(`TOTAL DB BOOKINGS: ${allBookings.length}`);
    console.log(`BOOKINGS for ${targetDateStr}: ${targetBookings.length}`);
    console.log(`AUTOMATIC BOOKINGS for ${targetDateStr}: ${autoTargetBookings.length}`);
    console.log(`ALL AUTOMATIC BOOKINGS IN DB: ${autoAllBookings.length}`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
