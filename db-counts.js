const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const start = new Date(tomorrow.setHours(0, 0, 0, 0));
    const end = new Date(tomorrow.setHours(23, 59, 59, 999));

    const allBookings = await prisma.booking.findMany();

    const tomorrowBookings = allBookings.filter(b => b.scheduledAt >= start && b.scheduledAt <= end);

    console.log(`TOTAL DB BOOKINGS: ${allBookings.length}`);
    console.log(`TOMORROW BOOKINGS: ${tomorrowBookings.length}`);
    console.log(`TOMORROW AUTOMATIC: ${tomorrowBookings.filter(b => b.isAutomatic).length}`);
    console.log(`ALL AUTOMATIC (ALL TIME): ${allBookings.filter(b => b.isAutomatic).length}`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
