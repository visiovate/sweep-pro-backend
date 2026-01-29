const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database with essential data...');

  try {
    // 1. Seed Apartments
    console.log('\n📍 Seeding apartments...');
    const apartments = [
      { name: 'Aparna CyberLife', area: 'Nallagandla', pincode: '500019' },
      { name: 'Aparna HillPark Avenue', area: 'Chandanagar', pincode: '500050' },
      { name: 'Aparna Kanopy Tulip', area: 'Kompally', pincode: '500100' },
      { name: 'Aparna Sarovar Grande', area: 'Nallagandla', pincode: '500019' },
      { name: 'Aparna Serene Park', area: 'Kondapur', pincode: '500084' },
      { name: 'Bollineni Bion', area: 'Kothaguda', pincode: '500084' },
      { name: 'Brigade Citadel', area: 'Moti Nagar', pincode: '500018' },
      { name: 'Cybercity Oriana', area: 'Moosapet', pincode: '500018' },
      { name: 'Fortune Green Homes Sapphire', area: 'Bachupally', pincode: '500090' },
      { name: 'Fortune Sky Villas', area: 'Kokapet', pincode: '500075' },
      { name: 'Godrej Madison Avenue', area: 'Kokapet', pincode: '500075' },
      { name: 'L&T Serene County', area: 'Gachibowli', pincode: '500032' },
      { name: 'Lanco Hills Apartments', area: 'Manikonda', pincode: '500089' },
      { name: 'Lodha Bellezza', area: 'Kukatpally', pincode: '500072' },
      { name: 'Malaysian Township', area: 'Kukatpally', pincode: '500072' },
      { name: 'My Home Abhra', area: 'Madhapur', pincode: '500081' },
      { name: 'My Home Apas', area: 'Kokapet', pincode: '500075' },
      { name: 'My Home Avali', area: 'Gopanpally', pincode: '500075' },
      { name: 'My Home Bhooja', area: 'Hitech City', pincode: '500081' },
      { name: 'My Home Grava', area: 'Kokapet', pincode: '500075' },
      { name: 'My Home Krishe', area: 'Gachibowli', pincode: '500032' },
      { name: 'My Home Mangala', area: 'Kondapur', pincode: '500084' },
      { name: 'My Home Nishada', area: 'Kokapet', pincode: '500075' },
      { name: 'My Home Raka', area: 'Madinaguda', pincode: '500049' },
      { name: 'My Home Sayuk', area: 'Tellapur', pincode: '500019' },
      { name: 'My Home Tridasa', area: 'Tellapur', pincode: '500019' },
      { name: 'My Home Vipina', area: 'Tellapur', pincode: '500019' },
      { name: 'Prestige Beverly Hills', area: 'Kokapet', pincode: '500075' },
      { name: 'Prestige High Fields', area: 'Gachibowli', pincode: '500032' },
      { name: 'Prestige Ivy League', area: 'Hitech City', pincode: '500081' },
      { name: 'Prestige Rainbow Waters', area: 'Gachibowli', pincode: '500032' },
    ];

    await prisma.apartment.deleteMany({});
    const apartmentResult = await prisma.apartment.createMany({
      data: apartments,
      skipDuplicates: true
    });
    console.log(`✅ Seeded ${apartmentResult.count} apartments`);

    // 2. Seed Services
    console.log('\n🧹 Seeding services...');
    
    const services = [
      {
        id: 'daily-cleaning-service',
        name: 'Daily Cleaning',
        description: 'Regular daily house cleaning service',
        baseDuration: 60,
        basePrice: 299,
        category: 'CLEANING',
        isActive: true
      },
      {
        id: 'deep-cleaning-service',
        name: 'Deep Cleaning',
        description: 'Comprehensive deep cleaning of your home',
        baseDuration: 120,
        basePrice: 599,
        category: 'DEEP_CLEANING',
        isActive: true
      },
      {
        id: 'maintenance-service',
        name: 'Maintenance Cleaning',
        description: 'Regular maintenance and light cleaning',
        baseDuration: 45,
        basePrice: 199,
        category: 'MAINTENANCE',
        isActive: true
      }
    ];

    for (const service of services) {
      await prisma.service.upsert({
        where: { id: service.id },
        update: {},
        create: service
      });
    }
    console.log(`✅ Seeded ${services.length} services`);

    // 3. Skip Subscription Plans (not in schema)

    // 4. Create Admin User
    console.log('\n👤 Seeding users...');
    const hashedAdminPassword = await bcrypt.hash('admin123', 10);
    const admin = await prisma.user.upsert({
      where: { email: 'admin@sweepro.com' },
      update: {},
      create: {
        email: 'admin@sweepro.com',
        name: 'Admin User',
        password: hashedAdminPassword,
        phone: '9876543210',
        role: 'ADMIN',
        status: 'ACTIVE',
        address: 'Admin Office, Hyderabad',
        profileImage: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Admin',
        bio: 'System Administrator',
        isProfilePublic: false,
        adminProfile: {
          create: {
            permissions: {
              canManageUsers: true,
              canManageServices: true,
              canManageBookings: true,
              canManagePayments: true
            },
            department: 'Operations',
            designation: 'Admin Manager'
          }
        }
      }
    });
    console.log(`✅ Created admin: ${admin.email}`);

    // 5. Create Sample Customer
    const hashedCustomerPassword = await bcrypt.hash('customer123', 10);
    const customer = await prisma.user.upsert({
      where: { email: 'customer@sweepro.com' },
      update: {},
      create: {
        email: 'customer@sweepro.com',
        name: 'John Customer',
        password: hashedCustomerPassword,
        phone: '9123456780',
        role: 'CUSTOMER',
        status: 'ACTIVE',
        address: '123 Main Street, Hyderabad',
        addressLine: 'Apartment 101, Green Valley Complex',
        city: 'Hyderabad',
        state: 'Telangana',
        pincode: '500081',
        latitude: 12.9716,
        longitude: 77.5946,
        timeSlot: '09:00-12:00',
        profileImage: 'https://api.dicebear.com/7.x/avataaars/svg?seed=John',
        bio: 'Home owner looking for reliable cleaning services',
        gender: 'Male',
        isProfilePublic: true,
        customerProfile: {
          create: {
            preferences: {
              preferredTime: 'morning',
              cleaningIntensity: 'regular'
            },
            emergencyContact: '9123456781'
          }
        }
      }
    });
    console.log(`✅ Created customer: ${customer.email}`);

    // 6. Create Sample Maid
    const hashedMaidPassword = await bcrypt.hash('maid123', 10);
    const maid = await prisma.user.upsert({
      where: { email: 'maid@sweepro.com' },
      update: {},
      create: {
        email: 'maid@sweepro.com',
        name: 'Sarah Maid',
        password: hashedMaidPassword,
        phone: '9123456789',
        role: 'MAID',
        status: 'ACTIVE',
        address: 'Service Area, Hyderabad',
        addressLine: 'Apartment 305, Service Complex',
        city: 'Hyderabad',
        state: 'Telangana',
        pincode: '500001',
        latitude: 12.9720,
        longitude: 77.5950,
        profileImage: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Sarah',
        bio: 'Professional house cleaner with 5+ years experience',
        gender: 'Female',
        isProfilePublic: true,
        maidProfile: {
          create: {
            skills: ['house_cleaning', 'deep_cleaning', 'kitchen_cleaning'],
            languages: ['English', 'Hindi', 'Telugu'],
            availability: {
              monday: { start: '08:00', end: '18:00' },
              tuesday: { start: '08:00', end: '18:00' },
              wednesday: { start: '08:00', end: '18:00' },
              thursday: { start: '08:00', end: '18:00' },
              friday: { start: '08:00', end: '18:00' },
              saturday: { start: '10:00', end: '16:00' },
              sunday: null
            },
            status: 'ACTIVE',
            isVerified: true,
            rating: 4.8,
            totalRatings: 250,
            completedBookings: 200,
            experienceYears: 5
          }
        }
      }
    });
    console.log(`✅ Created maid: ${maid.email}`);

    // 7. Create another sample customer and maid
    const hashedCustomer2Password = await bcrypt.hash('customer2123', 10);
    const customer2 = await prisma.user.upsert({
      where: { email: 'customer2@sweepro.com' },
      update: {},
      create: {
        email: 'customer2@sweepro.com',
        name: 'Jane Customer',
        password: hashedCustomer2Password,
        phone: '9123456782',
        role: 'CUSTOMER',
        status: 'ACTIVE',
        address: '456 Oak Street, Hyderabad',
        city: 'Hyderabad',
        state: 'Telangana',
        pincode: '500032',
        latitude: 12.9717,
        longitude: 77.5947,
        timeSlot: '14:00-17:00',
        profileImage: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Jane',
        bio: 'Professional seeking hassle-free home cleaning',
        gender: 'Female',
        isProfilePublic: true,
        customerProfile: {
          create: {
            preferences: {
              preferredTime: 'evening',
              cleaningIntensity: 'deep'
            },
            emergencyContact: '9123456782'
          }
        }
      }
    });
    console.log(`✅ Created customer: ${customer2.email}`);

    const hashedMaid2Password = await bcrypt.hash('maid2123', 10);
    const maid2 = await prisma.user.upsert({
      where: { email: 'maid2@sweepro.com' },
      update: {},
      create: {
        email: 'maid2@sweepro.com',
        name: 'Priya Sharma',
        password: hashedMaid2Password,
        phone: '9123456783',
        role: 'MAID',
        status: 'ACTIVE',
        address: 'Service Area 2, Hyderabad',
        city: 'Hyderabad',
        state: 'Telangana',
        pincode: '500003',
        latitude: 12.9721,
        longitude: 77.5951,
        profileImage: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Priya',
        bio: 'Expert in deep cleaning with specialized skills',
        gender: 'Female',
        isProfilePublic: true,
        maidProfile: {
          create: {
            skills: ['house_cleaning', 'deep_cleaning', 'kitchen_cleaning', 'laundry'],
            languages: ['English', 'Hindi', 'Telugu', 'Kannada'],
            availability: {
              monday: { start: '08:00', end: '18:00' },
              tuesday: { start: '08:00', end: '18:00' },
              wednesday: { start: '08:00', end: '18:00' },
              thursday: { start: '08:00', end: '18:00' },
              friday: { start: '08:00', end: '18:00' },
              saturday: { start: '10:00', end: '16:00' },
              sunday: null
            },
            status: 'ACTIVE',
            isVerified: true,
            rating: 4.9,
            totalRatings: 320,
            completedBookings: 290,
            experienceYears: 6
          }
        }
      }
    });
    console.log(`✅ Created maid: ${maid2.email}`);

    // Summary
    console.log('\n✅ Database seeding complete!');
    console.log('\n📊 Summary:');
    console.log(`  • Apartments: 31`);
    console.log(`  • Services: 3`);
    console.log(`  • Admin Users: 1 (admin@sweepro.com)`);
    console.log(`  • Customers: 2`);
    console.log(`  • Maids: 2`);
    console.log('\n🔑 Test Credentials:');
    console.log(`  Admin: admin@sweepro.com / admin123`);
    console.log(`  Customer 1: customer@sweepro.com / customer123`);
    console.log(`  Customer 2: customer2@sweepro.com / customer2123`);
    console.log(`  Maid 1: maid@sweepro.com / maid123`);
    console.log(`  Maid 2: maid2@sweepro.com / maid2123`);

  } catch (error) {
    console.error('❌ Error seeding database:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
