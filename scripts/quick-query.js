require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

(async () => {
    // Assignments
    const a = await p.customerMaidAssignment.findMany({
        include: {
            customer: { select: { name: true, email: true, timeSlot: true } },
            maid: { select: { user: { select: { name: true } }, status: true, weeklyOffDay: true } }
        }
    });
    console.log('=== ASSIGNMENTS ===');
    console.log('Count:', a.length);
    a.forEach(x => console.log(
        'Active:', x.isActive,
        '| Customer:', x.customer.name,
        '| Slot:', x.customer.timeSlot,
        '| Maid:', x.maid.user.name,
        '| MaidStatus:', x.maid.status
    ));

    // Bookings
    const totalBookings = await p.booking.count();
    const recent = await p.booking.findMany({
        orderBy: { scheduledAt: 'desc' },
        take: 5,
        select: {
            scheduledAt: true, status: true, assignmentStatus: true,
            assignment_sent: true, timeSlot: true,
            customer: { select: { name: true, timeSlot: true } }
        }
    });
    console.log('\n=== BOOKINGS ===');
    console.log('Total:', totalBookings);
    recent.forEach(x => console.log(
        'Scheduled:', x.scheduledAt.toISOString(),
        '| Status:', x.status,
        '| AssignStatus:', x.assignmentStatus,
        '| Sent:', x.assignment_sent,
        '| CustSlot:', x.customer.timeSlot,
        '| BookingSlot:', x.timeSlot
    ));

    await p.$disconnect();
})();
