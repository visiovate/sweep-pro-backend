const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  try {
    // Create admin user
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
        address: 'Admin Office',
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

    // Create sample customer
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
        address: '123 Main Street, City Center',
        latitude: 12.9716,
        longitude: 77.5946,
        customerProfile: {
          create: {
            preferences: {
              preferredTime: 'morning',
              cleaningIntensity: 'regular'
            },
            emergencyContact: '9876543211'
          }
        }
      }
    });

    // Create sample maid
    const hashedMaidPassword = await bcrypt.hash('maid123', 10);
    const maid = await prisma.user.upsert({
      where: { email: 'maid@sweepro.com' },
      update: {},
      create: {
        email: 'maid@sweepro.com',
        name: 'Sarah Maid',
        password: hashedMaidPassword,
        phone: '9123456781',
        role: 'MAID',
        address: '456 Service Lane, Worker Area',
        latitude: 12.9716,
        longitude: 77.5946,
        maidProfile: {
          create: {
            skills: ['house_cleaning', 'kitchen_cleaning', 'bathroom_cleaning'],
            languages: ['English', 'Hindi'],
            availability: {
              monday: { start: '08:00', end: '18:00' },
              tuesday: { start: '08:00', end: '18:00' },
              wednesday: { start: '08:00', end: '18:00' },
              thursday: { start: '08:00', end: '18:00' },
              friday: { start: '08:00', end: '18:00' },
              saturday: { start: '09:00', end: '15:00' }
            },
            rating: 4.5,
            totalRatings: 10,
            status: 'ACTIVE',
            hourlyRate: 150.0,
            serviceRadius: 5.0
          }
        }
      }
    });

    // Create services
    const dailyCleaningService = await prisma.service.upsert({
      where: { id: 'daily-cleaning-service' },
      update: {},
      create: {
        id: 'daily-cleaning-service',
        name: 'Daily House Cleaning',
        description: 'Regular daily house cleaning service including sweeping, mopping, and dusting',
        category: 'CLEANING',
        baseDuration: 120, // 2 hours
        basePrice: 200.0,
        isActive: true,
        bufferTime: 30,
        maxDailyBookings: 20
      }
    });

    const deepCleaningService = await prisma.service.upsert({
      where: { id: 'deep-cleaning-service' },
      update: {},
      create: {
        id: 'deep-cleaning-service',
        name: 'Deep Cleaning Service',
        description: 'Comprehensive deep cleaning including kitchen, bathrooms, and all rooms',
        category: 'DEEP_CLEANING',
        baseDuration: 240, // 4 hours
        basePrice: 500.0,
        isActive: true,
        bufferTime: 60,
        maxDailyBookings: 10
      }
    });

    const maintenanceService = await prisma.service.upsert({
      where: { id: 'maintenance-service' },
      update: {},
      create: {
        id: 'maintenance-service',
        name: 'Home Maintenance',
        description: 'Basic home maintenance and organizing service',
        category: 'MAINTENANCE',
        baseDuration: 180, // 3 hours
        basePrice: 350.0,
        isActive: true,
        bufferTime: 45,
        maxDailyBookings: 15
      }
    });

    // Create subscription plans
    const basicPlan = await prisma.servicePlan.upsert({
      where: { id: 'basic-plan' },
      update: {},
      create: {
        id: 'basic-plan',
        name: 'Basic Daily Cleaning',
        description: 'Daily house cleaning service - Perfect for small homes',
        serviceId: dailyCleaningService.id,
        sessionsPerWeek: 7,
        sessionsPerMonth: 30,
        duration: 1, // 1 month
        basePrice: 6000.0,
        discountPercent: 10.0,
        finalPrice: 5400.0, // 10% discount
        isActive: true,
        isPopular: false
      }
    });

    const premiumPlan = await prisma.servicePlan.upsert({
      where: { id: 'premium-plan' },
      update: {},
      create: {
        id: 'premium-plan',
        name: 'Premium Deep Cleaning',
        description: 'Deep cleaning service 3 times a week - For thorough cleanliness',
        serviceId: deepCleaningService.id,
        sessionsPerWeek: 3,
        sessionsPerMonth: 12,
        duration: 1, // 1 month
        basePrice: 7000.0,
        discountPercent: 15.0,
        finalPrice: 5950.0, // 15% discount
        isActive: true,
        isPopular: true
      }
    });

    const standardPlan = await prisma.servicePlan.upsert({
      where: { id: 'standard-plan' },
      update: {},
      create: {
        id: 'standard-plan',
        name: 'Standard Maintenance',
        description: 'Home maintenance service twice a week - Keep your home organized',
        serviceId: maintenanceService.id,
        sessionsPerWeek: 2,
        sessionsPerMonth: 8,
        duration: 1, // 1 month
        basePrice: 3500.0,
        discountPercent: 5.0,
        finalPrice: 3325.0, // 5% discount
        isActive: true,
        isPopular: false
      }
    });

    console.log('✅ Database seeded successfully!');
    console.log('📄 Created:');
    console.log('- Admin user: admin@sweepro.com (password: admin123)');
    console.log('- Customer user: customer@sweepro.com (password: customer123)');
    console.log('- Maid user: maid@sweepro.com (password: maid123)');
    console.log('- 3 Services: Daily Cleaning, Deep Cleaning, Maintenance');

    console.log('- 3 Subscription Plans: Basic, Premium, Standard');

    // Create subscriptions for all customers
    console.log('\n📋 Creating subscriptions for customers...');
    
    // Subscribe customer1 to basic plan
    const customer1Profile = await prisma.customerProfile.findUnique({
      where: { userId: customer.id }
    });
    
    await prisma.subscription.create({
      data: {
        customerId: customer1Profile.id,
        planId: basicPlan.id,
        status: 'ACTIVE',
        startDate: new Date(),
        endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        billingCycle: 'MONTHLY',
        amount: basicPlan.finalPrice,
        discount: basicPlan.basePrice - basicPlan.finalPrice,
        autoRenew: true,
        nextBillDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      }
    });
    
    console.log('✅ Created subscription for customer@sweepro.com (Basic Plan)');

    // Create 5 CONFIRMED bookings with maidId: null for admin pending bookings endpoint
    await prisma.booking.create({
      data: {
        customer: { connect: { email: 'customer@sweepro.com' } },
        maid: undefined,
        service: { connect: { id: dailyCleaningService.id } },
        status: 'CONFIRMED',
        priority: 'NORMAL',
        scheduledAt: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000),
        estimatedDuration: 120,
        serviceAddress: '123 Main Street, City Center',
        serviceLatitude: 12.9716,
        serviceLongitude: 77.5946,
        totalAmount: 200.0,
        discount: 0,
        finalAmount: 200.0
      }
    });

    // 2. New Customer & Maid
    const user2 = await prisma.user.create({
      data: {
        email: 'customer2@sweepro.com',
        name: 'Jane Customer',
        password: await bcrypt.hash('customer2123', 10),
        phone: '9123456782',
        role: 'CUSTOMER',
        address: '456 Main Street, City Center',
        latitude: 12.9717,
        longitude: 77.5947,
        customerProfile: {
          create: {
            preferences: { preferredTime: 'evening', cleaningIntensity: 'deep' },
            emergencyContact: '9876543212'
          }
        }
      }
    });
    const maid2 = await prisma.user.create({
      data: {
        email: 'maid2@sweepro.com',
        name: 'Priya Maid',
        password: await bcrypt.hash('maid2123', 10),
        phone: '9123456783',
        role: 'MAID',
        address: '789 Service Lane, Worker Area',
        latitude: 12.9718,
        longitude: 77.5948,
        maidProfile: {
          create: {
            skills: ['window_cleaning'],
            languages: ['English'],
            availability: { sunday: { start: '10:00', end: '16:00' } },
            rating: 4.0,
            totalRatings: 5,
            status: 'ACTIVE',
            hourlyRate: 120.0,
            serviceRadius: 3.0
          }
        }
      }
    });
    // Subscribe customer2 to premium plan
    const customer2Profile = await prisma.customerProfile.findUnique({
      where: { userId: user2.id }
    });
    
    await prisma.subscription.create({
      data: {
        customerId: customer2Profile.id,
        planId: premiumPlan.id,
        status: 'ACTIVE',
        startDate: new Date(),
        endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        billingCycle: 'MONTHLY',
        amount: premiumPlan.finalPrice,
        discount: premiumPlan.basePrice - premiumPlan.finalPrice,
        autoRenew: true,
        nextBillDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      }
    });
    
    console.log('✅ Created subscription for customer2@sweepro.com (Premium Plan)');

    await prisma.booking.create({
      data: {
        customer: { connect: { id: user2.id } },
        maid: undefined,
        service: { connect: { id: deepCleaningService.id } },
        status: 'CONFIRMED',
        priority: 'NORMAL',
        scheduledAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
        estimatedDuration: 240,
        serviceAddress: '456 Main Street, City Center',
        serviceLatitude: 12.9717,
        serviceLongitude: 77.5947,
        totalAmount: 500.0,
        discount: 0,
        finalAmount: 500.0
      }
    });

    // 3. New Customer & Maid
    const user3 = await prisma.user.create({
      data: {
        email: 'customer3@sweepro.com',
        name: 'Alex Customer',
        password: await bcrypt.hash('customer3123', 10),
        phone: '9123456784',
        role: 'CUSTOMER',
        address: '789 Main Street, City Center',
        latitude: 12.9719,
        longitude: 77.5949,
        customerProfile: {
          create: {
            preferences: { preferredTime: 'afternoon', cleaningIntensity: 'regular' },
            emergencyContact: '9876543213'
          }
        }
      }
    });
    const maid3 = await prisma.user.create({
      data: {
        email: 'maid3@sweepro.com',
        name: 'Ravi Maid',
        password: await bcrypt.hash('maid3123', 10),
        phone: '9123456785',
        role: 'MAID',
        address: '101 Service Lane, Worker Area',
        latitude: 12.9720,
        longitude: 77.5950,
        maidProfile: {
          create: {
            skills: ['carpet_cleaning'],
            languages: ['Hindi'],
            availability: { monday: { start: '09:00', end: '17:00' } },
            rating: 4.2,
            totalRatings: 7,
            status: 'ACTIVE',
            hourlyRate: 130.0,
            serviceRadius: 4.0
          }
        }
      }
    });
    // Subscribe customer3 to standard plan
    const customer3Profile = await prisma.customerProfile.findUnique({
      where: { userId: user3.id }
    });
    
    await prisma.subscription.create({
      data: {
        customerId: customer3Profile.id,
        planId: standardPlan.id,
        status: 'ACTIVE',
        startDate: new Date(),
        endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        billingCycle: 'MONTHLY',
        amount: standardPlan.finalPrice,
        discount: standardPlan.basePrice - standardPlan.finalPrice,
        autoRenew: true,
        nextBillDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      }
    });
    
    console.log('✅ Created subscription for customer3@sweepro.com (Standard Plan)');

    await prisma.booking.create({
      data: {
        customer: { connect: { id: user3.id } },
        maid: undefined,
        service: { connect: { id: maintenanceService.id } },
        status: 'CONFIRMED',
        priority: 'NORMAL',
        scheduledAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
        estimatedDuration: 180,
        serviceAddress: '789 Main Street, City Center',
        serviceLatitude: 12.9719,
        serviceLongitude: 77.5949,
        totalAmount: 350.0,
        discount: 0,
        finalAmount: 350.0
      }
    });

    // 4. New Customer & Maid
    const user4 = await prisma.user.create({
      data: {
        email: 'customer4@sweepro.com',
        name: 'Sam Customer',
        password: await bcrypt.hash('customer4123', 10),
        phone: '9123456786',
        role: 'CUSTOMER',
        address: '102 Main Street, City Center',
        latitude: 12.9721,
        longitude: 77.5951,
        customerProfile: {
          create: {
            preferences: { preferredTime: 'morning', cleaningIntensity: 'deep' },
            emergencyContact: '9876543214'
          }
        }
      }
    });
    const maid4 = await prisma.user.create({
      data: {
        email: 'maid4@sweepro.com',
        name: 'Anita Maid',
        password: await bcrypt.hash('maid4123', 10),
        phone: '9123456787',
        role: 'MAID',
        address: '102 Service Lane, Worker Area',
        latitude: 12.9722,
        longitude: 77.5952,
        maidProfile: {
          create: {
            skills: ['sofa_cleaning'],
            languages: ['English', 'Hindi'],
            availability: { tuesday: { start: '10:00', end: '18:00' } },
            rating: 4.3,
            totalRatings: 8,
            status: 'ACTIVE',
            hourlyRate: 140.0,
            serviceRadius: 4.5
          }
        }
      }
    });
    // Subscribe customer4 to basic plan
    const customer4Profile = await prisma.customerProfile.findUnique({
      where: { userId: user4.id }
    });
    
    await prisma.subscription.create({
      data: {
        customerId: customer4Profile.id,
        planId: basicPlan.id,
        status: 'ACTIVE',
        startDate: new Date(),
        endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        billingCycle: 'MONTHLY',
        amount: basicPlan.finalPrice,
        discount: basicPlan.basePrice - basicPlan.finalPrice,
        autoRenew: true,
        nextBillDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      }
    });
    
    console.log('✅ Created subscription for customer4@sweepro.com (Basic Plan)');

    await prisma.booking.create({
      data: {
        customer: { connect: { id: user4.id } },
        maid: undefined,
        service: { connect: { id: dailyCleaningService.id } },
        status: 'CONFIRMED',
        priority: 'NORMAL',
        scheduledAt: new Date(Date.now() + 4 * 24 * 60 * 60 * 1000),
        estimatedDuration: 120,
        serviceAddress: '102 Main Street, City Center',
        serviceLatitude: 12.9721,
        serviceLongitude: 77.5951,
        totalAmount: 200.0,
        discount: 0,
        finalAmount: 200.0
      }
    });

    // 5. New Customer & Maid
    const user5 = await prisma.user.create({
      data: {
        email: 'customer5@sweepro.com',
        name: 'Nina Customer',
        password: await bcrypt.hash('customer5123', 10),
        phone: '9123456788',
        role: 'CUSTOMER',
        address: '103 Main Street, City Center',
        latitude: 12.9723,
        longitude: 77.5953,
        customerProfile: {
          create: {
            preferences: { preferredTime: 'evening', cleaningIntensity: 'regular' },
            emergencyContact: '9876543215'
          }
        }
      }
    });
    const maid5 = await prisma.user.create({
      data: {
        email: 'maid5@sweepro.com',
        name: 'Vijay Maid',
        password: await bcrypt.hash('maid5123', 10),
        phone: '9123456789',
        role: 'MAID',
        address: '103 Service Lane, Worker Area',
        latitude: 12.9724,
        longitude: 77.5954,
        maidProfile: {
          create: {
            skills: ['floor_polishing'],
            languages: ['English'],
            availability: { wednesday: { start: '11:00', end: '17:00' } },
            rating: 4.1,
            totalRatings: 6,
            status: 'ACTIVE',
            hourlyRate: 125.0,
            serviceRadius: 3.5
          }
        }
      }
    });
    // Subscribe customer5 to premium plan
    const customer5Profile = await prisma.customerProfile.findUnique({
      where: { userId: user5.id }
    });
    
    await prisma.subscription.create({
      data: {
        customerId: customer5Profile.id,
        planId: premiumPlan.id,
        status: 'ACTIVE',
        startDate: new Date(),
        endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        billingCycle: 'MONTHLY',
        amount: premiumPlan.finalPrice,
        discount: premiumPlan.basePrice - premiumPlan.finalPrice,
        autoRenew: true,
        nextBillDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      }
    });
    
    console.log('✅ Created subscription for customer5@sweepro.com (Premium Plan)');

    await prisma.booking.create({
      data: {
        customer: { connect: { id: user5.id } },
        maid: undefined,
        service: { connect: { id: deepCleaningService.id } },
        status: 'CONFIRMED',
        priority: 'NORMAL',
        scheduledAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
        estimatedDuration: 240,
        serviceAddress: '103 Main Street, City Center',
        serviceLatitude: 12.9723,
        serviceLongitude: 77.5953,
        totalAmount: 500.0,
        discount: 0,
        finalAmount: 500.0
      }
    });
    console.log('- 5 Pending Bookings created for 5 different customers and maids.');
    console.log('- 5 Active Subscriptions created for all customers:');
    console.log('  • customer@sweepro.com: Basic Plan (₹5,400/month)');
    console.log('  • customer2@sweepro.com: Premium Plan (₹5,950/month)');
    console.log('  • customer3@sweepro.com: Standard Plan (₹3,325/month)');
    console.log('  • customer4@sweepro.com: Basic Plan (₹5,400/month)');
    console.log('  • customer5@sweepro.com: Premium Plan (₹5,950/month)');
    console.log('\n💳 All customers now have active subscriptions and can create bookings!');

  } catch (error) {
    console.error('❌ Error seeding database:', error);
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