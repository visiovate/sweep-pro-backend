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
        status: 'ACTIVE',
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
        status: 'ACTIVE',
        address: '123 Main Street, City Center',
        latitude: 12.9716,
        longitude: 77.5946,
        timeSlot: '09:00-12:00',
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
        status: 'ACTIVE',
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
        isPopular: false,
        bufferDaysAllowed: 3
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
        isPopular: true,
        bufferDaysAllowed: 3
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
        isPopular: false,
        bufferDaysAllowed: 3
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
    console.log('\n📋 Creating subscriptions and payments for customers...');
    
    // Subscribe customer1 to basic plan
    const customer1Profile = await prisma.customerProfile.findUnique({
      where: { userId: customer.id }
    });
    
    const subscription1 = await prisma.subscription.upsert({
      where: { customerId: customer1Profile.id },
      update: {},
      create: {
        customerId: customer1Profile.id,
        planId: basicPlan.id,
        status: 'ACTIVE',
        startDate: new Date(),
        endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        billingCycle: 'MONTHLY',
        amount: basicPlan.finalPrice,
        discount: basicPlan.basePrice - basicPlan.finalPrice,
        autoRenew: true,
        nextBillDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        bufferDaysCount: 3,
        currentCycleStart: new Date(),
        currentCycleEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      }
    });
    
    // Create subscription payment for customer1
    await prisma.payment.create({
      data: {
        subscriptionId: subscription1.id,
        customerId: customer.id,
        amount: basicPlan.finalPrice,
        discount: basicPlan.basePrice - basicPlan.finalPrice,
        tax: 0,
        finalAmount: basicPlan.finalPrice,
        paymentMethod: 'UPI',
        status: 'COMPLETED',
        paymentType: 'SUBSCRIPTION',
        gateway: 'razorpay',
        transactionId: 'txn_basic_' + Date.now()
      }
    });
    
    console.log('✅ Created subscription and payment for customer@sweepro.com (Basic Plan)');

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
    const user2 = await prisma.user.upsert({
      where: { email: 'customer2@sweepro.com' },
      update: {},
      create: {
        email: 'customer2@sweepro.com',
        name: 'Jane Customer',
        password: await bcrypt.hash('customer2123', 10),
        phone: '9123456782',
        role: 'CUSTOMER',
        address: '456 Main Street, City Center',
        latitude: 12.9717,
        longitude: 77.5947,
        timeSlot: '14:00-17:00',
        customerProfile: {
          create: {
            preferences: { preferredTime: 'evening', cleaningIntensity: 'deep' },
            emergencyContact: '9876543212'
          }
        }
      }
    });
    const maid2 = await prisma.user.upsert({
      where: { email: 'maid2@sweepro.com' },
      update: {},
      create: {
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
    
    const subscription2 = await prisma.subscription.upsert({
      where: { customerId: customer2Profile.id },
      update: {},
      create: {
        customerId: customer2Profile.id,
        planId: premiumPlan.id,
        status: 'ACTIVE',
        startDate: new Date(),
        endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        billingCycle: 'MONTHLY',
        amount: premiumPlan.finalPrice,
        discount: premiumPlan.basePrice - premiumPlan.finalPrice,
        autoRenew: true,
        nextBillDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        bufferDaysCount: 3,
        currentCycleStart: new Date(),
        currentCycleEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      }
    });
    
    // Create subscription payment for customer2
    await prisma.payment.create({
      data: {
        subscriptionId: subscription2.id,
        customerId: user2.id,
        amount: premiumPlan.finalPrice,
        discount: premiumPlan.basePrice - premiumPlan.finalPrice,
        tax: 0,
        finalAmount: premiumPlan.finalPrice,
        paymentMethod: 'CARD',
        status: 'COMPLETED',
        paymentType: 'SUBSCRIPTION',
        gateway: 'stripe',
        transactionId: 'txn_premium_' + Date.now()
      }
    });
    
    console.log('✅ Created subscription and payment for customer2@sweepro.com (Premium Plan)');

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
    const user3 = await prisma.user.upsert({
      where: { email: 'customer3@sweepro.com' },
      update: {},
      create: {
        email: 'customer3@sweepro.com',
        name: 'Alex Customer',
        password: await bcrypt.hash('customer3123', 10),
        phone: '9123456784',
        role: 'CUSTOMER',
        address: '789 Main Street, City Center',
        latitude: 12.9719,
        longitude: 77.5949,
        timeSlot: '11:00-14:00',
        customerProfile: {
          create: {
            preferences: { preferredTime: 'afternoon', cleaningIntensity: 'regular' },
            emergencyContact: '9876543213'
          }
        }
      }
    });
    const maid3 = await prisma.user.upsert({
      where: { email: 'maid3@sweepro.com' },
      update: {},
      create: {
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
    
    const subscription3 = await prisma.subscription.upsert({
      where: { customerId: customer3Profile.id },
      update: {},
      create: {
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
    
    // Create subscription payment for customer3
    await prisma.payment.create({
      data: {
        subscriptionId: subscription3.id,
        customerId: user3.id,
        amount: standardPlan.finalPrice,
        discount: standardPlan.basePrice - standardPlan.finalPrice,
        tax: 0,
        finalAmount: standardPlan.finalPrice,
        paymentMethod: 'NET_BANKING',
        status: 'COMPLETED',
        paymentType: 'SUBSCRIPTION',
        gateway: 'razorpay',
        transactionId: 'txn_standard_' + Date.now()
      }
    });
    
    console.log('✅ Created subscription and payment for customer3@sweepro.com (Standard Plan)');

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
    const user4 = await prisma.user.upsert({
      where: { email: 'customer4@sweepro.com' },
      update: {},
      create: {
        email: 'customer4@sweepro.com',
        name: 'Sam Customer',
        password: await bcrypt.hash('customer4123', 10),
        phone: '9123456786',
        role: 'CUSTOMER',
        address: '102 Main Street, City Center',
        latitude: 12.9721,
        longitude: 77.5951,
        timeSlot: '08:00-11:00',
        customerProfile: {
          create: {
            preferences: { preferredTime: 'morning', cleaningIntensity: 'deep' },
            emergencyContact: '9876543214'
          }
        }
      }
    });
    const maid4 = await prisma.user.upsert({
      where: { email: 'maid4@sweepro.com' },
      update: {},
      create: {
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
    
    const subscription4 = await prisma.subscription.upsert({
      where: { customerId: customer4Profile.id },
      update: {},
      create: {
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
    
    // Create subscription payment for customer4
    await prisma.payment.create({
      data: {
        subscriptionId: subscription4.id,
        customerId: user4.id,
        amount: basicPlan.finalPrice,
        discount: basicPlan.basePrice - basicPlan.finalPrice,
        tax: 0,
        finalAmount: basicPlan.finalPrice,
        paymentMethod: 'WALLET',
        status: 'COMPLETED',
        paymentType: 'SUBSCRIPTION',
        gateway: 'paytm',
        transactionId: 'txn_basic2_' + Date.now()
      }
    });
    
    console.log('✅ Created subscription and payment for customer4@sweepro.com (Basic Plan)');

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
    const user5 = await prisma.user.upsert({
      where: { email: 'customer5@sweepro.com' },
      update: {},
      create: {
        email: 'customer5@sweepro.com',
        name: 'Nina Customer',
        password: await bcrypt.hash('customer5123', 10),
        phone: '9123456788',
        role: 'CUSTOMER',
        address: '103 Main Street, City Center',
        latitude: 12.9723,
        longitude: 77.5953,
        timeSlot: '16:00-19:00',
        customerProfile: {
          create: {
            preferences: { preferredTime: 'evening', cleaningIntensity: 'regular' },
            emergencyContact: '9876543215'
          }
        }
      }
    });
    const maid5 = await prisma.user.upsert({
      where: { email: 'maid5@sweepro.com' },
      update: {},
      create: {
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
    
    const subscription5 = await prisma.subscription.upsert({
      where: { customerId: customer5Profile.id },
      update: {},
      create: {
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
    
    // Create subscription payment for customer5
    await prisma.payment.create({
      data: {
        subscriptionId: subscription5.id,
        customerId: user5.id,
        amount: premiumPlan.finalPrice,
        discount: premiumPlan.basePrice - premiumPlan.finalPrice,
        tax: 0,
        finalAmount: premiumPlan.finalPrice,
        paymentMethod: 'UPI',
        status: 'COMPLETED',
        paymentType: 'SUBSCRIPTION',
        gateway: 'razorpay',
        transactionId: 'txn_premium2_' + Date.now()
      }
    });
    
    console.log('✅ Created subscription and payment for customer5@sweepro.com (Premium Plan)');

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
    
    // Create additional test users for comprehensive testing
    console.log('\n🔄 Creating additional test data...');
    
    // Customer with pending subscription payment
    const customerPending = await prisma.user.upsert({
      where: { email: 'pending@sweepro.com' },
      update: {},
      create: {
        email: 'pending@sweepro.com',
        name: 'Pending Customer',
        password: await bcrypt.hash('pending123', 10),
        phone: '9123456999',
        role: 'CUSTOMER',
        address: '999 Pending Street',
        latitude: 12.9725,
        longitude: 77.5955,
        timeSlot: '13:00-16:00',
        customerProfile: {
          create: {
            preferences: { preferredTime: 'morning' },
            emergencyContact: '9876543299'
          }
        }
      }
    });
    
    const pendingCustomerProfile = await prisma.customerProfile.findUnique({
      where: { userId: customerPending.id }
    });
    
    // Create pending subscription
    const pendingSubscription = await prisma.subscription.upsert({
      where: { customerId: pendingCustomerProfile.id },
      update: {},
      create: {
        customerId: pendingCustomerProfile.id,
        planId: premiumPlan.id,
        status: 'PENDING_PAYMENT',
        startDate: new Date(),
        endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        billingCycle: 'MONTHLY',
        amount: premiumPlan.finalPrice,
        discount: premiumPlan.basePrice - premiumPlan.finalPrice,
        autoRenew: true,
        nextBillDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      }
    });
    
    // Create pending payment for subscription
    await prisma.payment.create({
      data: {
        subscriptionId: pendingSubscription.id,
        customerId: customerPending.id,
        amount: premiumPlan.finalPrice,
        discount: premiumPlan.basePrice - premiumPlan.finalPrice,
        tax: 0,
        finalAmount: premiumPlan.finalPrice,
        paymentMethod: 'CARD',
        status: 'PENDING',
        paymentType: 'SUBSCRIPTION',
        gateway: 'razorpay'
      }
    });
    
    // Create some failed and refunded payments for testing
    await prisma.payment.create({
      data: {
        subscriptionId: subscription1.id,
        customerId: customer.id,
        amount: basicPlan.finalPrice,
        discount: 0,
        tax: 0,
        finalAmount: basicPlan.finalPrice,
        paymentMethod: 'CARD',
        status: 'FAILED',
        paymentType: 'RENEWAL',
        gateway: 'stripe',
        transactionId: 'txn_failed_' + Date.now()
      }
    });
    
    await prisma.payment.create({
      data: {
        subscriptionId: subscription2.id,
        customerId: user2.id,
        amount: premiumPlan.finalPrice,
        discount: 0,
        tax: 18.0, // GST
        finalAmount: premiumPlan.finalPrice + 18.0,
        paymentMethod: 'UPI',
        status: 'REFUNDED',
        paymentType: 'SUBSCRIPTION',
        gateway: 'razorpay',
        transactionId: 'txn_refunded_' + Date.now(),
        refundAmount: premiumPlan.finalPrice + 18.0,
        refundReason: 'Customer request',
        refundedAt: new Date()
      }
    });
    
    console.log('✅ Created pending subscription for pending@sweepro.com');
    console.log('✅ Created test payments with different statuses (FAILED, REFUNDED)');
    
    // Create diverse booking statuses for testing filtering functionality
    console.log('\n🔄 Creating diverse booking statuses for testing filters...');
    
    // Create COMPLETED bookings (past dates)
    await prisma.booking.create({
      data: {
        customer: { connect: { email: 'customer@sweepro.com' } },
        maid: { connect: { email: 'maid@sweepro.com' } },
        service: { connect: { id: dailyCleaningService.id } },
        status: 'COMPLETED',
        priority: 'NORMAL',
        scheduledAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // 7 days ago
        completedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000 + 2 * 60 * 60 * 1000), // 2 hours after scheduled
        estimatedDuration: 120,
        actualEndTime: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000 + 2 * 60 * 60 * 1000),
        serviceAddress: '123 Main Street, City Center',
        serviceLatitude: 12.9716,
        serviceLongitude: 77.5946,
        totalAmount: 0, // Subscription customer
        discount: 0,
        finalAmount: 0
      }
    });

    await prisma.booking.create({
      data: {
        customer: { connect: { email: 'customer2@sweepro.com' } },
        maid: { connect: { email: 'maid2@sweepro.com' } },
        service: { connect: { id: deepCleaningService.id } },
        status: 'COMPLETED',
        priority: 'HIGH',
        scheduledAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000), // 5 days ago
        completedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000 + 4 * 60 * 60 * 1000), // 4 hours after scheduled
        estimatedDuration: 240,
        actualEndTime: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000 + 4 * 60 * 60 * 1000),
        serviceAddress: '456 Main Street, City Center',
        serviceLatitude: 12.9717,
        serviceLongitude: 77.5947,
        totalAmount: 0, // Subscription customer
        discount: 0,
        finalAmount: 0
      }
    });

    // Create ASSIGNED bookings (maid assigned but not started)
    await prisma.booking.create({
      data: {
        customer: { connect: { email: 'customer3@sweepro.com' } },
        maid: { connect: { email: 'maid3@sweepro.com' } },
        service: { connect: { id: maintenanceService.id } },
        status: 'ASSIGNED',
        priority: 'NORMAL',
        scheduledAt: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000), // Tomorrow
        estimatedDuration: 180,
        serviceAddress: '789 Main Street, City Center',
        serviceLatitude: 12.9719,
        serviceLongitude: 77.5949,
        totalAmount: 0, // Subscription customer
        discount: 0,
        finalAmount: 0
      }
    });

    await prisma.booking.create({
      data: {
        customer: { connect: { email: 'customer4@sweepro.com' } },
        maid: { connect: { email: 'maid4@sweepro.com' } },
        service: { connect: { id: dailyCleaningService.id } },
        status: 'ASSIGNED',
        priority: 'HIGH',
        scheduledAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000), // Day after tomorrow
        estimatedDuration: 120,
        serviceAddress: '102 Main Street, City Center',
        serviceLatitude: 12.9721,
        serviceLongitude: 77.5951,
        totalAmount: 0, // Subscription customer
        discount: 0,
        finalAmount: 0
      }
    });

    // Create IN_PROGRESS bookings (currently being serviced)
    await prisma.booking.create({
      data: {
        customer: { connect: { email: 'customer5@sweepro.com' } },
        maid: { connect: { email: 'maid5@sweepro.com' } },
        service: { connect: { id: deepCleaningService.id } },
        status: 'IN_PROGRESS',
        priority: 'NORMAL',
        scheduledAt: new Date(Date.now() - 1 * 60 * 60 * 1000), // 1 hour ago
        actualStartTime: new Date(Date.now() - 1 * 60 * 60 * 1000), // Started 1 hour ago
        estimatedDuration: 240,
        serviceAddress: '103 Main Street, City Center',
        serviceLatitude: 12.9723,
        serviceLongitude: 77.5953,
        totalAmount: 0, // Subscription customer
        discount: 0,
        finalAmount: 0
      }
    });

    // Create CANCELLED bookings
    await prisma.booking.create({
      data: {
        customer: { connect: { email: 'customer@sweepro.com' } },
        maid: undefined,
        service: { connect: { id: dailyCleaningService.id } },
        status: 'CANCELLED',
        priority: 'NORMAL',
        scheduledAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000), // 3 days ago
        estimatedDuration: 120,
        serviceAddress: '123 Main Street, City Center',
        serviceLatitude: 12.9716,
        serviceLongitude: 77.5946,
        totalAmount: 0, // Subscription customer
        discount: 0,
        finalAmount: 0
      }
    });

    await prisma.booking.create({
      data: {
        customer: { connect: { email: 'customer2@sweepro.com' } },
        maid: undefined,
        service: { connect: { id: deepCleaningService.id } },
        status: 'CANCELLED',
        priority: 'LOW',
        scheduledAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), // 2 days ago
        estimatedDuration: 240,
        serviceAddress: '456 Main Street, City Center',
        serviceLatitude: 12.9717,
        serviceLongitude: 77.5947,
        totalAmount: 0, // Subscription customer
        discount: 0,
        finalAmount: 0
      }
    });

    // Create RESCHEDULED bookings
    await prisma.booking.create({
      data: {
        customer: { connect: { email: 'customer3@sweepro.com' } },
        maid: undefined,
        service: { connect: { id: maintenanceService.id } },
        status: 'RESCHEDULED',
        priority: 'NORMAL',
        scheduledAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // Next week
        estimatedDuration: 180,
        serviceAddress: '789 Main Street, City Center',
        serviceLatitude: 12.9719,
        serviceLongitude: 77.5949,
        totalAmount: 0, // Subscription customer
        discount: 0,
        finalAmount: 0
      }
    });

    // Create NO_SHOW bookings
    await prisma.booking.create({
      data: {
        customer: { connect: { email: 'customer4@sweepro.com' } },
        maid: { connect: { email: 'maid4@sweepro.com' } },
        service: { connect: { id: dailyCleaningService.id } },
        status: 'NO_SHOW',
        priority: 'NORMAL',
        scheduledAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000), // Yesterday
        estimatedDuration: 120,
        serviceAddress: '102 Main Street, City Center',
        serviceLatitude: 12.9721,
        serviceLongitude: 77.5951,
        totalAmount: 0, // Subscription customer
        discount: 0,
        finalAmount: 0
      }
    });

    console.log('✅ Created diverse booking statuses for testing filters:');
    console.log('  • 2 COMPLETED bookings (past dates)');
    console.log('  • 2 ASSIGNED bookings (maid assigned, not started)');
    console.log('  • 1 IN_PROGRESS booking (currently being serviced)');
    console.log('  • 2 CANCELLED bookings');
    console.log('  • 1 RESCHEDULED booking');
    console.log('  • 1 NO_SHOW booking');
    console.log('  • 5 CONFIRMED bookings (from previous section)');
    console.log('\n📊 Total: 14 bookings with different statuses for comprehensive testing');
    
    console.log('\n💳 All customers now have active subscriptions and can create bookings!');
    console.log('\n🧪 Test Users Created:');
    console.log('- admin@sweepro.com (password: admin123) - Admin');
    console.log('- customer@sweepro.com (password: customer123) - Customer with Basic Plan');
    console.log('- customer2@sweepro.com (password: customer2123) - Customer with Premium Plan');
    console.log('- customer3@sweepro.com (password: customer3123) - Customer with Standard Plan');
    console.log('- customer4@sweepro.com (password: customer4123) - Customer with Basic Plan');
    console.log('- customer5@sweepro.com (password: customer5123) - Customer with Premium Plan');
    console.log('- pending@sweepro.com (password: pending123) - Customer with Pending Payment');
    console.log('- maid@sweepro.com (password: maid123) - Maid');
    console.log('- maid2@sweepro.com (password: maid2123) - Maid');
    console.log('- maid3@sweepro.com (password: maid3123) - Maid');
    console.log('- maid4@sweepro.com (password: maid4123) - Maid');
    console.log('- maid5@sweepro.com (password: maid5123) - Maid');

    // Now create comprehensive buffer period test scenarios
    console.log('\n🛡️ Creating buffer period test scenarios...');
    
    // Calculate dates for buffer period testing
    const now = new Date();
    const currentDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0); // Last day of current month
    
    // Customer with active buffer period (last 3 days of month)
    const bufferCustomer = await prisma.user.upsert({
      where: { email: 'buffer@sweepro.com' },
      update: {},
      create: {
        email: 'buffer@sweepro.com',
        name: 'Buffer Customer',
        password: await bcrypt.hash('buffer123', 10),
        phone: '9123456790',
        role: 'CUSTOMER',
        address: '200 Buffer Street, Test City',
        latitude: 12.9726,
        longitude: 77.5956,
        timeSlot: '10:00-13:00',
        customerProfile: {
          create: {
            preferences: { preferredTime: 'morning', cleaningIntensity: 'regular' },
            emergencyContact: '9876543290'
          }
        }
      }
    });
    
    const bufferCustomerProfile = await prisma.customerProfile.findUnique({
      where: { userId: bufferCustomer.id }
    });
    
    // Create subscription with current buffer period
    const bufferSubscription = await prisma.subscription.upsert({
      where: { customerId: bufferCustomerProfile.id },
      update: {},
      create: {
        customerId: bufferCustomerProfile.id,
        planId: basicPlan.id,
        status: 'ACTIVE',
        startDate: monthStart,
        endDate: nextMonthStart,
        billingCycle: 'MONTHLY',
        amount: basicPlan.finalPrice,
        discount: basicPlan.basePrice - basicPlan.finalPrice,
        autoRenew: true,
        nextBillDate: nextMonthStart,
        bufferDaysCount: 3,
        bufferDaysUsed: 2, // Already used 2 buffer days
        isInBufferPeriod: true, // Currently in buffer period
        bufferStartDate: new Date(monthEnd.getTime() - 2 * 24 * 60 * 60 * 1000), // Started 2 days ago
        bufferEndDate: new Date(nextMonthStart.getTime() + 1 * 24 * 60 * 60 * 1000), // Ends tomorrow
        currentCycleStart: monthStart,
        currentCycleEnd: nextMonthStart,
        totalCycles: 3,
        completedCycles: 2
      }
    });
    
    // Create current subscription cycle
    const bufferCurrentCycle = await prisma.subscriptionCycle.create({
      data: {
        subscriptionId: bufferSubscription.id,
        cycleNumber: 3,
        startDate: monthStart,
        endDate: nextMonthStart,
        status: 'IN_BUFFER',
        totalServices: 30,
        completedServices: 25,
        skippedServices: 2, // Services skipped due to buffer
        bufferDaysUsed: 2,
        isBufferActive: true,
        bufferStartDate: new Date(monthEnd.getTime() - 2 * 24 * 60 * 60 * 1000),
        bufferEndDate: new Date(nextMonthStart.getTime() + 1 * 24 * 60 * 60 * 1000),
        paymentStatus: 'COMPLETED',
        amount: basicPlan.finalPrice
      }
    });
    
    // Create active buffer period
    await prisma.bufferPeriod.create({
      data: {
        subscriptionId: bufferSubscription.id,
        cycleId: bufferCurrentCycle.id,
        startDate: new Date(monthEnd.getTime() - 2 * 24 * 60 * 60 * 1000),
        endDate: new Date(nextMonthStart.getTime() + 1 * 24 * 60 * 60 * 1000),
        status: 'ACTIVE',
        reason: 'END_OF_MONTH',
        daysCount: 3,
        servicesSkipped: 2,
        autoResumeDate: new Date(nextMonthStart.getTime() + 1 * 24 * 60 * 60 * 1000),
        isAutomatic: true,
        notes: 'Automatic end-of-month buffer period'
      }
    });
    
    // Create historical buffer periods for this customer
    await prisma.bufferPeriod.create({
      data: {
        subscriptionId: bufferSubscription.id,
        cycleId: null,
        startDate: new Date(now.getTime() - 35 * 24 * 60 * 60 * 1000), // 35 days ago
        endDate: new Date(now.getTime() - 32 * 24 * 60 * 60 * 1000), // 32 days ago
        status: 'COMPLETED',
        reason: 'CUSTOMER_REQUEST',
        daysCount: 3,
        servicesSkipped: 3,
        autoResumeDate: new Date(now.getTime() - 32 * 24 * 60 * 60 * 1000),
        resumedAt: new Date(now.getTime() - 32 * 24 * 60 * 60 * 1000),
        isAutomatic: false,
        notes: 'Customer requested break for travel'
      }
    });
    
    await prisma.bufferPeriod.create({
      data: {
        subscriptionId: bufferSubscription.id,
        cycleId: null,
        startDate: new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000), // 15 days ago
        endDate: new Date(now.getTime() - 13 * 24 * 60 * 60 * 1000), // 13 days ago
        status: 'COMPLETED',
        reason: 'ADMIN_PAUSE',
        daysCount: 2,
        servicesSkipped: 2,
        autoResumeDate: new Date(now.getTime() - 13 * 24 * 60 * 60 * 1000),
        resumedAt: new Date(now.getTime() - 13 * 24 * 60 * 60 * 1000),
        isAutomatic: false,
        notes: 'Admin pause for maid training'
      }
    });
    
    // Customer with expired subscription needing renewal
    const expiredCustomer = await prisma.user.upsert({
      where: { email: 'expired@sweepro.com' },
      update: {},
      create: {
        email: 'expired@sweepro.com',
        name: 'Expired Customer',
        password: await bcrypt.hash('expired123', 10),
        phone: '9123456791',
        role: 'CUSTOMER',
        address: '300 Expired Avenue, Test City',
        latitude: 12.9727,
        longitude: 77.5957,
        timeSlot: '15:00-18:00',
        customerProfile: {
          create: {
            preferences: { preferredTime: 'evening', cleaningIntensity: 'deep' },
            emergencyContact: '9876543291'
          }
        }
      }
    });
    
    const expiredCustomerProfile = await prisma.customerProfile.findUnique({
      where: { userId: expiredCustomer.id }
    });
    
    // Create expired subscription
    const expiredSubscription = await prisma.subscription.upsert({
      where: { customerId: expiredCustomerProfile.id },
      update: {},
      create: {
        customerId: expiredCustomerProfile.id,
        planId: premiumPlan.id,
        status: 'EXPIRED',
        startDate: new Date(now.getTime() - 35 * 24 * 60 * 60 * 1000),
        endDate: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000), // Expired 5 days ago
        billingCycle: 'MONTHLY',
        amount: premiumPlan.finalPrice,
        discount: premiumPlan.basePrice - premiumPlan.finalPrice,
        autoRenew: false, // Auto-renewal disabled
        nextBillDate: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000),
        bufferDaysCount: 3,
        bufferDaysUsed: 3, // Used all buffer days
        isInBufferPeriod: false,
        totalCycles: 1,
        completedCycles: 1
      }
    });
    
    // Customer with cancelled subscription during buffer period
    const cancelledCustomer = await prisma.user.upsert({
      where: { email: 'cancelled@sweepro.com' },
      update: {},
      create: {
        email: 'cancelled@sweepro.com',
        name: 'Cancelled Customer',
        password: await bcrypt.hash('cancelled123', 10),
        phone: '9123456792',
        role: 'CUSTOMER',
        address: '400 Cancelled Road, Test City',
        latitude: 12.9728,
        longitude: 77.5958,
        timeSlot: '12:00-15:00',
        customerProfile: {
          create: {
            preferences: { preferredTime: 'afternoon', cleaningIntensity: 'regular' },
            emergencyContact: '9876543292'
          }
        }
      }
    });
    
    const cancelledCustomerProfile = await prisma.customerProfile.findUnique({
      where: { userId: cancelledCustomer.id }
    });
    
    // Create cancelled subscription
    const cancelledSubscription = await prisma.subscription.upsert({
      where: { customerId: cancelledCustomerProfile.id },
      update: {},
      create: {
        customerId: cancelledCustomerProfile.id,
        planId: standardPlan.id,
        status: 'CANCELLED',
        startDate: new Date(now.getTime() - 20 * 24 * 60 * 60 * 1000),
        endDate: new Date(now.getTime() + 10 * 24 * 60 * 60 * 1000),
        billingCycle: 'MONTHLY',
        amount: standardPlan.finalPrice,
        discount: standardPlan.basePrice - standardPlan.finalPrice,
        autoRenew: true,
        nextBillDate: new Date(now.getTime() + 10 * 24 * 60 * 60 * 1000),
        bufferDaysCount: 3,
        bufferDaysUsed: 1,
        isInBufferPeriod: false,
        totalCycles: 1,
        completedCycles: 0
      }
    });
    
    // Create cancelled buffer period
    await prisma.bufferPeriod.create({
      data: {
        subscriptionId: cancelledSubscription.id,
        cycleId: null,
        startDate: new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000),
        endDate: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000),
        status: 'CANCELLED',
        reason: 'CUSTOMER_REQUEST',
        daysCount: 3,
        servicesSkipped: 1,
        autoResumeDate: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000),
        isAutomatic: false,
        notes: 'Buffer period cancelled due to subscription cancellation'
      }
    });
    
    // Customer with paused subscription
    const pausedCustomer = await prisma.user.upsert({
      where: { email: 'paused@sweepro.com' },
      update: {},
      create: {
        email: 'paused@sweepro.com',
        name: 'Paused Customer',
        password: await bcrypt.hash('paused123', 10),
        phone: '9123456793',
        role: 'CUSTOMER',
        address: '500 Paused Place, Test City',
        latitude: 12.9729,
        longitude: 77.5959,
        timeSlot: '08:00-11:00',
        customerProfile: {
          create: {
            preferences: { preferredTime: 'morning', cleaningIntensity: 'deep' },
            emergencyContact: '9876543293'
          }
        }
      }
    });
    
    const pausedCustomerProfile = await prisma.customerProfile.findUnique({
      where: { userId: pausedCustomer.id }
    });
    
    // Create paused subscription
    const pausedSubscription = await prisma.subscription.upsert({
      where: { customerId: pausedCustomerProfile.id },
      update: {},
      create: {
        customerId: pausedCustomerProfile.id,
        planId: basicPlan.id,
        status: 'SUSPENDED',
        startDate: new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000),
        endDate: new Date(now.getTime() + 15 * 24 * 60 * 60 * 1000),
        billingCycle: 'MONTHLY',
        amount: basicPlan.finalPrice,
        discount: basicPlan.basePrice - basicPlan.finalPrice,
        autoRenew: true,
        nextBillDate: new Date(now.getTime() + 15 * 24 * 60 * 60 * 1000),
        bufferDaysCount: 3,
        bufferDaysUsed: 0,
        isInBufferPeriod: false,
        isPaused: true,
        pausedAt: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000),
        resumeAt: new Date(now.getTime() + 10 * 24 * 60 * 60 * 1000),
        pauseReason: 'Customer travel',
        totalCycles: 1,
        completedCycles: 0
      }
    });
    
    // Create comprehensive booking scenarios for buffer testing
    console.log('\n📅 Creating comprehensive booking scenarios...');
    
    // Past completed bookings (successful services)
    for (let i = 7; i >= 1; i--) {
      await prisma.booking.create({
        data: {
          customerId: bufferCustomer.id,
          maidId: maid.id,
          serviceId: dailyCleaningService.id,
          cycleId: bufferCurrentCycle.id,
          status: 'COMPLETED',
          priority: 'NORMAL',
          scheduledAt: new Date(now.getTime() - i * 24 * 60 * 60 * 1000),
          actualStartTime: new Date(now.getTime() - i * 24 * 60 * 60 * 1000),
          actualEndTime: new Date(now.getTime() - i * 24 * 60 * 60 * 1000 + 2 * 60 * 60 * 1000),
          completedAt: new Date(now.getTime() - i * 24 * 60 * 60 * 1000 + 2 * 60 * 60 * 1000),
          estimatedDuration: 120,
          serviceAddress: '200 Buffer Street, Test City',
          serviceLatitude: 12.9726,
          serviceLongitude: 77.5956,
          totalAmount: 0, // Subscription based
          discount: 0,
          finalAmount: 0,
          isSubscriptionBased: true,
          isBufferSkipped: false
        }
      });
    }
    
    // Buffer period skipped bookings
    for (let i = 1; i <= 2; i++) {
      await prisma.booking.create({
        data: {
          customerId: bufferCustomer.id,
          maidId: null, // No maid assigned during buffer
          serviceId: dailyCleaningService.id,
          cycleId: bufferCurrentCycle.id,
          status: 'CANCELLED',
          priority: 'NORMAL',
          scheduledAt: new Date(monthEnd.getTime() - (3 - i) * 24 * 60 * 60 * 1000),
          estimatedDuration: 120,
          serviceAddress: '200 Buffer Street, Test City',
          serviceLatitude: 12.9726,
          serviceLongitude: 77.5956,
          totalAmount: 0,
          discount: 0,
          finalAmount: 0,
          isSubscriptionBased: true,
          isBufferSkipped: true, // Skipped due to buffer period
          specialInstructions: 'Service cancelled due to buffer period'
        }
      });
    }
    
    // Upcoming scheduled bookings (post buffer period)
    for (let i = 1; i <= 5; i++) {
      await prisma.booking.create({
        data: {
          customerId: bufferCustomer.id,
          maidId: null, // Will be assigned by scheduler
          serviceId: dailyCleaningService.id,
          status: 'CONFIRMED',
          priority: 'NORMAL',
          scheduledAt: new Date(nextMonthStart.getTime() + (i + 1) * 24 * 60 * 60 * 1000),
          estimatedDuration: 120,
          serviceAddress: '200 Buffer Street, Test City',
          serviceLatitude: 12.9726,
          serviceLongitude: 77.5956,
          totalAmount: 0,
          discount: 0,
          finalAmount: 0,
          isSubscriptionBased: true,
          isBufferSkipped: false
        }
      });
    }
    
    // Create payment history for all subscriptions
    console.log('\n💰 Creating comprehensive payment history...');
    
    // Buffer customer payments
    await prisma.payment.create({
      data: {
        subscriptionId: bufferSubscription.id,
        customerId: bufferCustomer.id,
        amount: basicPlan.finalPrice,
        discount: basicPlan.basePrice - basicPlan.finalPrice,
        tax: 0,
        finalAmount: basicPlan.finalPrice,
        paymentMethod: 'UPI',
        status: 'COMPLETED',
        paymentType: 'SUBSCRIPTION',
        gateway: 'razorpay',
        transactionId: 'txn_buffer_' + Date.now()
      }
    });
    
    // Expired customer payments (last payment failed)
    await prisma.payment.create({
      data: {
        subscriptionId: expiredSubscription.id,
        customerId: expiredCustomer.id,
        amount: premiumPlan.finalPrice,
        discount: 0,
        tax: 0,
        finalAmount: premiumPlan.finalPrice,
        paymentMethod: 'CARD',
        status: 'FAILED',
        paymentType: 'RENEWAL',
        gateway: 'razorpay',
        transactionId: 'txn_expired_failed_' + Date.now()
      }
    });
    
    // Previous successful payment for expired customer
    await prisma.payment.create({
      data: {
        subscriptionId: expiredSubscription.id,
        customerId: expiredCustomer.id,
        amount: premiumPlan.finalPrice,
        discount: premiumPlan.basePrice - premiumPlan.finalPrice,
        tax: 0,
        finalAmount: premiumPlan.finalPrice,
        paymentMethod: 'UPI',
        status: 'COMPLETED',
        paymentType: 'SUBSCRIPTION',
        gateway: 'razorpay',
        transactionId: 'txn_expired_success_' + (Date.now() - 86400000)
      }
    });
    
    // Cancelled customer refund
    await prisma.payment.create({
      data: {
        subscriptionId: cancelledSubscription.id,
        customerId: cancelledCustomer.id,
        amount: standardPlan.finalPrice,
        discount: standardPlan.basePrice - standardPlan.finalPrice,
        tax: 0,
        finalAmount: standardPlan.finalPrice,
        paymentMethod: 'CARD',
        status: 'REFUNDED',
        paymentType: 'SUBSCRIPTION',
        gateway: 'stripe',
        transactionId: 'txn_cancelled_refund_' + Date.now(),
        refundAmount: standardPlan.finalPrice,
        refundReason: 'Subscription cancelled by customer',
        refundedAt: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000)
      }
    });
    
    // Paused customer payment (will be processed when resumed)
    await prisma.payment.create({
      data: {
        subscriptionId: pausedSubscription.id,
        customerId: pausedCustomer.id,
        amount: basicPlan.finalPrice,
        discount: basicPlan.basePrice - basicPlan.finalPrice,
        tax: 0,
        finalAmount: basicPlan.finalPrice,
        paymentMethod: 'NET_BANKING',
        status: 'PENDING',
        paymentType: 'SUBSCRIPTION',
        gateway: 'razorpay'
      }
    });
    
    // Create some daily scheduled services to show automatic scheduling
    console.log('\n🤖 Creating automatically scheduled services...');
    
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    // Create automatic daily services for active customers
    const activeCustomers = [customer, user2, user3, user4, user5];
    
    for (let i = 0; i < activeCustomers.length; i++) {
      const cust = activeCustomers[i];
      
      // Create service for today (in progress or completed)
      const serviceTime = new Date(today);
      serviceTime.setHours(9 + i, 0, 0, 0); // Different times for each customer
      
      await prisma.booking.create({
        data: {
          customerId: cust.id,
          maidId: i < 3 ? [maid, maid2, maid3][i].id : null, // Some with maids assigned
          serviceId: [dailyCleaningService, deepCleaningService, maintenanceService][i % 3].id,
          status: i < 2 ? 'COMPLETED' : i < 4 ? 'IN_PROGRESS' : 'ASSIGNED',
          priority: 'NORMAL',
          scheduledAt: serviceTime,
          actualStartTime: i < 4 ? serviceTime : null,
          actualEndTime: i < 2 ? new Date(serviceTime.getTime() + 2 * 60 * 60 * 1000) : null,
          completedAt: i < 2 ? new Date(serviceTime.getTime() + 2 * 60 * 60 * 1000) : null,
          estimatedDuration: [120, 240, 180][i % 3],
          serviceAddress: cust.address,
          serviceLatitude: cust.latitude,
          serviceLongitude: cust.longitude,
          totalAmount: 0, // Subscription based
          discount: 0,
          finalAmount: 0,
          isSubscriptionBased: true,
          isBufferSkipped: false,
          specialInstructions: 'Automatic daily service from subscription'
        }
      });
      
      // Create service for tomorrow (scheduled)
      const tomorrowService = new Date(tomorrow);
      tomorrowService.setHours(9 + i, 0, 0, 0);
      
      await prisma.booking.create({
        data: {
          customerId: cust.id,
          maidId: null, // Will be assigned by scheduler
          serviceId: [dailyCleaningService, deepCleaningService, maintenanceService][i % 3].id,
          status: 'CONFIRMED',
          priority: 'NORMAL',
          scheduledAt: tomorrowService,
          estimatedDuration: [120, 240, 180][i % 3],
          serviceAddress: cust.address,
          serviceLatitude: cust.latitude,
          serviceLongitude: cust.longitude,
          totalAmount: 0,
          discount: 0,
          finalAmount: 0,
          isSubscriptionBased: true,
          isBufferSkipped: false,
          specialInstructions: 'Automatically scheduled by system'
        }
      });
    }
    
    console.log('✅ Created automatically scheduled daily services for demonstration');
    
    console.log('\n✅ Comprehensive seed data created successfully!');
    console.log('\n🧪 Test Scenarios Available:');
    console.log('\n📋 SUBSCRIPTION STATUSES:');
    console.log('- customer@sweepro.com: ACTIVE subscription (Basic Plan)');
    console.log('- customer2@sweepro.com: ACTIVE subscription (Premium Plan)');
    console.log('- customer3@sweepro.com: ACTIVE subscription (Standard Plan)');
    console.log('- customer4@sweepro.com: ACTIVE subscription (Basic Plan)');
    console.log('- customer5@sweepro.com: ACTIVE subscription (Premium Plan)');
    console.log('- buffer@sweepro.com: ACTIVE subscription with ACTIVE buffer period');
    console.log('- expired@sweepro.com: EXPIRED subscription');
    console.log('- cancelled@sweepro.com: CANCELLED subscription');
    console.log('- paused@sweepro.com: SUSPENDED subscription');
    console.log('- pending@sweepro.com: PENDING_PAYMENT subscription');
    
    console.log('\n🛡️ BUFFER PERIOD SCENARIOS:');
    console.log('- buffer@sweepro.com has ACTIVE buffer period (last 3 days of month)');
    console.log('- Historical buffer periods with different reasons (CUSTOMER_REQUEST, ADMIN_PAUSE)');
    console.log('- cancelled@sweepro.com has CANCELLED buffer period');
    console.log('- All buffer periods have realistic service skipping data');
    
    console.log('\n📅 BOOKING SCENARIOS:');
    console.log('- Past completed bookings for all customers');
    console.log('- Buffer-skipped bookings (cancelled due to buffer period)');
    console.log('- Upcoming confirmed bookings (post-buffer period)');
    console.log('- Various booking statuses: COMPLETED, CANCELLED, CONFIRMED, ASSIGNED, IN_PROGRESS, etc.');
    
    console.log('\n💳 PAYMENT SCENARIOS:');
    console.log('- Successful subscription payments');
    console.log('- Failed renewal payments');
    console.log('- Refunded payments for cancelled subscriptions');
    console.log('- Pending payments for paused subscriptions');
    
    console.log('\n🤖 AUTOMATIC SCHEDULING FEATURES:');
    console.log('- Daily services are automatically scheduled for all active subscriptions');
    console.log('- No manual booking required - services run automatically');
    console.log('- Maids are assigned automatically by the system');
    console.log('- Buffer periods automatically pause scheduled services');
    console.log('- Services resume automatically after buffer period ends');
    
    console.log('\n🎯 TESTING RECOMMENDATIONS:');
    console.log('1. Login as any customer to see automatically scheduled services (no booking buttons)');
    console.log('2. Login as buffer@sweepro.com to request buffer days for pausing services');
    console.log('3. Login as expired@sweepro.com to test subscription renewal flow');
    console.log('4. Use admin@sweepro.com to approve/reject buffer requests');
    console.log('5. Check admin dashboard for pending buffer requests and affected services');
    console.log('6. Verify that services are automatically cancelled during buffer periods');
    console.log('7. Test the calendar view showing scheduled vs buffer days');
    console.log('8. Check notifications for buffer requests and approvals');
    console.log('9. Verify buffer day allocation rules (3/month, 7/3months, etc.)');
    console.log('10. Test admin can see which services are affected by buffer periods');
    
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