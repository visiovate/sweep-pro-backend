const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

// Available time slots (must match the frontend and backend constants)
const TIME_SLOTS = [
  '06:00 - 08:00',
  '08:00 - 10:00',
  '10:00 - 12:00',
  '12:00 - 14:00'
];

const MAX_USERS_PER_SLOT = 20;

async function main() {
  console.log('🕐 Seeding time slot data...\n');

  try {
    // ==========================================
    // STEP 1: Create/Update 10 Customers with proper time slots
    // ==========================================
    console.log('👥 Creating/Updating 10 customers with time slots...\n');

    const customerData = [
      { email: 'customer1@sweepro.com', name: 'Rahul Sharma', phone: '9876543001', timeSlot: '06:00 - 08:00' },
      { email: 'customer2@sweepro.com', name: 'Priya Patel', phone: '9876543002', timeSlot: '06:00 - 08:00' },
      { email: 'customer3@sweepro.com', name: 'Amit Kumar', phone: '9876543003', timeSlot: '08:00 - 10:00' },
      { email: 'customer4@sweepro.com', name: 'Sneha Reddy', phone: '9876543004', timeSlot: '08:00 - 10:00' },
      { email: 'customer5@sweepro.com', name: 'Vikram Singh', phone: '9876543005', timeSlot: '08:00 - 10:00' },
      { email: 'customer6@sweepro.com', name: 'Ananya Gupta', phone: '9876543006', timeSlot: '10:00 - 12:00' },
      { email: 'customer7@sweepro.com', name: 'Karthik Nair', phone: '9876543007', timeSlot: '10:00 - 12:00' },
      { email: 'customer8@sweepro.com', name: 'Deepika Iyer', phone: '9876543008', timeSlot: '12:00 - 14:00' },
      { email: 'customer9@sweepro.com', name: 'Arjun Menon', phone: '9876543009', timeSlot: '12:00 - 14:00' },
      { email: 'customer10@sweepro.com', name: 'Kavitha Rao', phone: '9876543010', timeSlot: '12:00 - 14:00' },
    ];

    const hashedPassword = await bcrypt.hash('customer123', 10);

    for (const customer of customerData) {
      await prisma.user.upsert({
        where: { email: customer.email },
        update: { 
          timeSlot: customer.timeSlot,
          name: customer.name,
          phone: customer.phone
        },
        create: {
          email: customer.email,
          name: customer.name,
          password: hashedPassword,
          phone: customer.phone,
          role: 'CUSTOMER',
          status: 'ACTIVE',
          timeSlot: customer.timeSlot,
          address: `${Math.floor(Math.random() * 999) + 1} Main Street, Hyderabad`,
          city: 'Hyderabad',
          state: 'Telangana',
          pincode: '500' + String(Math.floor(Math.random() * 100)).padStart(3, '0'),
          profileImage: `https://api.dicebear.com/7.x/avataaars/svg?seed=${customer.name.split(' ')[0]}`,
          customerProfile: {
            create: {
              preferences: { preferredTime: customer.timeSlot.split(' - ')[0] },
              specialInstructions: 'Standard cleaning service'
            }
          }
        }
      });
      console.log(`  ✅ ${customer.name} (${customer.email}) - Time slot: ${customer.timeSlot}`);
    }

    // ==========================================
    // STEP 2: Create 20 Maids
    // ==========================================
    console.log('\n👩‍🔧 Creating 20 maids...\n');

    const maidData = [
      { email: 'maid1@sweepro.com', name: 'Lakshmi Devi', phone: '9123456001' },
      { email: 'maid2@sweepro.com', name: 'Sarita Kumari', phone: '9123456002' },
      { email: 'maid3@sweepro.com', name: 'Meena Bai', phone: '9123456003' },
      { email: 'maid4@sweepro.com', name: 'Sunita Rani', phone: '9123456004' },
      { email: 'maid5@sweepro.com', name: 'Kamala Devi', phone: '9123456005' },
      { email: 'maid6@sweepro.com', name: 'Radha Kumari', phone: '9123456006' },
      { email: 'maid7@sweepro.com', name: 'Gita Devi', phone: '9123456007' },
      { email: 'maid8@sweepro.com', name: 'Parvati Bai', phone: '9123456008' },
      { email: 'maid9@sweepro.com', name: 'Shanti Devi', phone: '9123456009' },
      { email: 'maid10@sweepro.com', name: 'Anita Rani', phone: '9123456010' },
      { email: 'maid11@sweepro.com', name: 'Rekha Kumari', phone: '9123456011' },
      { email: 'maid12@sweepro.com', name: 'Savita Devi', phone: '9123456012' },
      { email: 'maid13@sweepro.com', name: 'Pushpa Bai', phone: '9123456013' },
      { email: 'maid14@sweepro.com', name: 'Rani Devi', phone: '9123456014' },
      { email: 'maid15@sweepro.com', name: 'Sushma Kumari', phone: '9123456015' },
      { email: 'maid16@sweepro.com', name: 'Kiran Devi', phone: '9123456016' },
      { email: 'maid17@sweepro.com', name: 'Nirmala Bai', phone: '9123456017' },
      { email: 'maid18@sweepro.com', name: 'Saroja Devi', phone: '9123456018' },
      { email: 'maid19@sweepro.com', name: 'Vimala Rani', phone: '9123456019' },
      { email: 'maid20@sweepro.com', name: 'Bharati Devi', phone: '9123456020' },
    ];

    const maidPassword = await bcrypt.hash('maid123', 10);

    for (const maid of maidData) {
      await prisma.user.upsert({
        where: { email: maid.email },
        update: { 
          name: maid.name,
          phone: maid.phone
        },
        create: {
          email: maid.email,
          name: maid.name,
          password: maidPassword,
          phone: maid.phone,
          role: 'MAID',
          status: 'ACTIVE',
          address: `${Math.floor(Math.random() * 999) + 1} Worker Colony, Hyderabad`,
          city: 'Hyderabad',
          state: 'Telangana',
          pincode: '500' + String(Math.floor(Math.random() * 100)).padStart(3, '0'),
          profileImage: `https://api.dicebear.com/7.x/avataaars/svg?seed=${maid.name.split(' ')[0]}`,
          maidProfile: {
            create: {
              skills: ['house_cleaning', 'kitchen_cleaning', 'bathroom_cleaning'],
              languages: ['Hindi', 'Telugu', 'English'],
              availability: {
                monday: { start: '06:00', end: '18:00' },
                tuesday: { start: '06:00', end: '18:00' },
                wednesday: { start: '06:00', end: '18:00' },
                thursday: { start: '06:00', end: '18:00' },
                friday: { start: '06:00', end: '18:00' },
                saturday: { start: '06:00', end: '14:00' }
              },
              rating: 4.0 + Math.random() * 1.0,
              totalRatings: Math.floor(Math.random() * 50) + 10,
              status: 'ACTIVE',
              hourlyRate: 100 + Math.floor(Math.random() * 100),
              serviceRadius: 5.0,
              experienceYears: Math.floor(Math.random() * 8) + 1,
              isVerified: true,
              verificationDate: new Date()
            }
          }
        }
      });
      console.log(`  ✅ ${maid.name} (${maid.email})`);
    }

    // ==========================================
    // STEP 3: Update TimeSlotBooking counts based on customers
    // ==========================================
    console.log('\n📊 Updating time slot booking counts...\n');

    // Count customers per time slot
    const slotCounts = {};
    for (const slot of TIME_SLOTS) {
      const count = await prisma.user.count({
        where: {
          role: 'CUSTOMER',
          timeSlot: slot
        }
      });
      slotCounts[slot] = count;
    }

    // Clear existing time slot bookings and recreate
    await prisma.timeSlotBooking.deleteMany({});

    for (const slot of TIME_SLOTS) {
      await prisma.timeSlotBooking.create({
        data: {
          timeSlot: slot,
          count: slotCounts[slot] || 0,
          maxLimit: MAX_USERS_PER_SLOT
        }
      });
      console.log(`  📊 ${slot}: ${slotCounts[slot] || 0}/${MAX_USERS_PER_SLOT} users`);
    }

    // ==========================================
    // Summary
    // ==========================================
    console.log('\n' + '='.repeat(60));
    console.log('✅ TIME SLOT SEEDING COMPLETE!');
    console.log('='.repeat(60));
    console.log('\n📊 Time Slot Distribution:');
    for (const slot of TIME_SLOTS) {
      const count = slotCounts[slot] || 0;
      const bar = '█'.repeat(count) + '░'.repeat(MAX_USERS_PER_SLOT - count);
      console.log(`  ${slot}: [${bar}] ${count}/${MAX_USERS_PER_SLOT}`);
    }
    console.log('\n👥 Customers: 10 created with time slots');
    console.log('👩‍🔧 Maids: 20 created');
    console.log('\n🔑 Login Credentials:');
    console.log('  Customers: customer1@sweepro.com to customer10@sweepro.com (password: customer123)');
    console.log('  Maids: maid1@sweepro.com to maid20@sweepro.com (password: maid123)');

  } catch (error) {
    console.error('❌ Error seeding time slot data:', error);
    throw error;
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
