const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function testMaidBookings() {
  try {
    console.log('🔍 MAID BOOKINGS DIAGNOSTIC TEST\n');

    // 1. Check if there are any maid users
    console.log('1️⃣ Checking for MAID users...');
    const maidUsers = await prisma.user.findMany({
      where: { role: 'MAID' },
      select: { id: true, name: true, email: true, role: true }
    });
    console.log(`   Found ${maidUsers.length} maid users`);
    maidUsers.forEach(m => console.log(`   - ${m.name} (${m.email}) - ID: ${m.id}`));

    // 2. Check if there are any bookings at all
    console.log('\n2️⃣ Checking all bookings...');
    const allBookings = await prisma.booking.findMany({
      select: { id: true, customerId: true, maidId: true, status: true, scheduledAt: true }
    });
    console.log(`   Found ${allBookings.length} total bookings`);
    if (allBookings.length > 0) {
      console.log('   Sample bookings:');
      allBookings.slice(0, 5).forEach(b => {
        console.log(`   - ID: ${b.id} | Customer: ${b.customerId} | Maid: ${b.maidId} | Status: ${b.status}`);
      });
    }

    // 3. Check if any bookings have maidId assigned
    console.log('\n3️⃣ Checking for bookings with maidId assigned...');
    const bookingsWithMaid = await prisma.booking.findMany({
      where: { maidId: { not: null } },
      select: { id: true, maidId: true, status: true, customer: { select: { name: true } } }
    });
    console.log(`   Found ${bookingsWithMaid.length} bookings with maidId assigned`);
    bookingsWithMaid.forEach(b => {
      console.log(`   - Booking: ${b.id} | Maid: ${b.maidId} | Customer: ${b.customer?.name} | Status: ${b.status}`);
    });

    // 4. Test the getMaidBookings query for each maid
    console.log('\n4️⃣ Testing getMaidBookings query for each maid...');
    for (const maid of maidUsers) {
      const maidBookings = await prisma.booking.findMany({
        where: { maidId: maid.id },
        include: {
          service: true,
          customer: {
            select: { id: true, name: true, email: true, phone: true }
          }
        }
      });
      console.log(`   Maid ${maid.name}: ${maidBookings.length} bookings`);
    }

    // 5. Check MaidProfile data
    console.log('\n5️⃣ Checking MaidProfile data...');
    const maidProfiles = await prisma.maidProfile.findMany({
      select: { 
        id: true, 
        userId: true,
        user: {
          select: { name: true, email: true }
        }
      }
    });
    console.log(`   Found ${maidProfiles.length} maid profiles`);
    maidProfiles.forEach(m => {
      console.log(`   - ${m.user?.name} (User ID: ${m.userId})`);
    });

    // 6. Simulation: Create a test booking with maid assignment
    console.log('\n6️⃣ Creating test booking with maid assignment...');
    
    if (maidUsers.length > 0 && maidProfiles.length > 0) {
      const customer = await prisma.user.findFirst({
        where: { role: 'CUSTOMER' }
      });

      if (customer) {
        const service = await prisma.service.findFirst();
        
        if (service) {
          const testBooking = await prisma.booking.create({
            data: {
              customerId: customer.id,
              maidId: maidUsers[0].id,
              serviceId: service.id,
              scheduledAt: new Date(Date.now() + 86400000), // Tomorrow
              timeSlot: '09:00-12:00',
              status: 'ASSIGNED',
              amount: service.basePrice,
              finalAmount: service.basePrice
            },
            include: {
              service: true,
              customer: { select: { name: true, email: true } }
            }
          });
          console.log(`   ✅ Created test booking: ${testBooking.id}`);
          console.log(`      Customer: ${testBooking.customer.name}`);
          console.log(`      Maid: ${maidUsers[0].name}`);
          console.log(`      Status: ${testBooking.status}`);
        }
      }
    }

    console.log('\n✅ Diagnostic complete!');

  } catch (error) {
    console.error('❌ Error during diagnostic:', error.message);
    console.error(error);
  } finally {
    await prisma.$disconnect();
  }
}

testMaidBookings();
