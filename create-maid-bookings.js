const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function createTestMaidBookings() {
  try {
    console.log('📌 CREATING TEST MAID BOOKINGS\n');

    // Get maid users
    const maidUsers = await prisma.user.findMany({
      where: { role: 'MAID' }
    });

    // Get customer users
    const customers = await prisma.user.findMany({
      where: { role: 'CUSTOMER' }
    });

    // Get a service
    const service = await prisma.service.findFirst();

    if (!maidUsers.length) {
      console.log('❌ No maid users found. Run seed script first.');
      return;
    }

    if (!customers.length) {
      console.log('❌ No customer users found. Run seed script first.');
      return;
    }

    if (!service) {
      console.log('❌ No services found. Run seed script first.');
      return;
    }

    console.log(`Found ${maidUsers.length} maid users`);
    console.log(`Found ${customers.length} customer users`);
    console.log(`Found service: ${service.name}\n`);

    // Create test bookings for each maid
    for (const maid of maidUsers) {
      const customer = customers[Math.floor(Math.random() * customers.length)];
      
      const tomorrowDate = new Date();
      tomorrowDate.setDate(tomorrowDate.getDate() + 1);
      
      const bookingTime = new Date(tomorrowDate);
      bookingTime.setHours(10, 0, 0, 0);

      const slotDate = new Date(tomorrowDate);
      slotDate.setHours(0, 0, 0, 0);

      const slotTime = new Date('1970-01-01T10:00:00');

      const booking = await prisma.booking.create({
        data: {
          customerId: customer.id,
          maidId: maid.id,
          serviceId: service.id,
          scheduledAt: bookingTime,
          slot_date: slotDate,
          slot_time: slotTime,
          serviceAddress: customer.address || 'Default Address',
          totalAmount: service.basePrice,
          discount: 0,
          finalAmount: service.basePrice,
          estimatedDuration: 120,
          status: 'ASSIGNED',
          timeSlot: '09:00-12:00'
        },
        include: {
          service: true,
          customer: { select: { name: true, email: true } },
          maid: { select: { name: true, email: true } }
        }
      });

      console.log(`✅ Created booking for maid: ${maid.name}`);
      console.log(`   Booking ID: ${booking.id}`);
      console.log(`   Customer: ${booking.customer.name}`);
      console.log(`   Service: ${booking.service.name}`);
      console.log(`   Status: ${booking.status}\n`);
    }

    // Verify bookings were created
    console.log('📊 VERIFICATION\n');
    
    for (const maid of maidUsers) {
      const maidBookings = await prisma.booking.findMany({
        where: { maidId: maid.id },
        include: {
          service: true,
          customer: { select: { name: true } }
        }
      });

      console.log(`✅ ${maid.name} has ${maidBookings.length} booking(s)`);
      maidBookings.forEach(b => {
        console.log(`   - ${b.customer.name} | ${b.service.name} | ${b.status}`);
      });
    }

    console.log('\n✅ Test bookings created successfully!');
    console.log('\n💡 Next step: Call the getMaidBookings API');
    console.log('   GET /bookings/my-assignments (as maid user)');

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
  } finally {
    await prisma.$disconnect();
  }
}

createTestMaidBookings();
