const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const start = new Date(tomorrow.setHours(0, 0, 0, 0));
    const end = new Date(tomorrow.setHours(23, 59, 59, 999));

    console.log(`Checking bookings between ${start.toISOString()} and ${end.toISOString()}`);

    const bookings = await prisma.booking.findMany({
        where: {
            scheduledAt: { gte: start, lte: end }
        },
        select: {
            id: true,
            customerId: true,
            isAutomatic: true,
            status: true,
            assignmentStatus: true,
            customer: { select: { name: true } }
        }
    });

    console.log(`Found ${bookings.length} total bookings for tomorrow`);

    const automaticCount = bookings.filter(b => b.isAutomatic).length;
    const manualCount = bookings.filter(b => !b.isAutomatic).length;

    console.log(`Automatic: ${automaticCount}, Manual (isAutomatic is false/null): ${manualCount}`);

    console.log('\nSample of manual bookings:');
    console.log(bookings.filter(b => !b.isAutomatic));
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
