const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function ensureCustomerProfile(userId) {
  let profile = await prisma.customerProfile.findUnique({ where: { userId } });
  if (!profile) {
    profile = await prisma.customerProfile.create({
      data: {
        userId,
        preferences: {},
        emergencyContact: null,
        specialInstructions: null
      }
    });
  }
  return profile;
}

async function ensureMaidProfile(userId, data) {
  let profile = await prisma.maidProfile.findUnique({ where: { userId } });

  if (!profile) {
    return await prisma.maidProfile.create({ data: { userId, ...data } });
  }

  return await prisma.maidProfile.update({
    where: { userId },
    data
  });
}

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
        profileImage: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Admin',
        bio: 'System Administrator managing Sweep Pro operations',
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
        addressLine: 'Apartment 101, Green Valley Complex',
        locality: 'City Center',
        city: 'Bangalore',
        state: 'Karnataka',
        pincode: '560001',
        landmark: 'Near Central Mall',
        latitude: 12.9716,
        longitude: 77.5946,
        timeSlot: '09:00-12:00',
        profileImage: 'https://api.dicebear.com/7.x/avataaars/svg?seed=John',
        coverImage: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=1200&h=400&fit=crop',
        bio: 'Homeowner looking for reliable and professional cleaning services',
        gender: 'Male',
        isProfilePublic: true,
        socialLinks: {
          facebook: 'https://facebook.com/johncustomer',
          instagram: 'https://instagram.com/johncustomer'
        },
        customerProfile: {
          create: {
            preferences: {
              preferredTime: 'morning',
              cleaningIntensity: 'regular'
            },
            emergencyContact: '9876543211',
            specialInstructions: 'Please use eco-friendly cleaning products',
            interests: ['Eco-friendly cleaning', 'Home organization', 'Deep cleaning'],
            favoriteServices: ['Daily House Cleaning', 'Deep Cleaning Service']
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
        addressLine: 'Room 205, Workers Hostel',
        locality: 'Worker Area',
        city: 'Bangalore',
        state: 'Karnataka',
        pincode: '560002',
        latitude: 12.9716,
        longitude: 77.5946,
        profileImage: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Sarah',
        coverImage: 'https://images.unsplash.com/photo-1581578731548-c64695cc6952?w=1200&h=400&fit=crop',
        bio: 'Professional cleaner with 5+ years of experience. Specialized in deep cleaning and eco-friendly products.',
        gender: 'Female',
        isProfilePublic: true,
        socialLinks: {
          instagram: 'https://instagram.com/sarahmaid'
        },
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
            serviceRadius: 5.0,
            experienceYears: 5,
            certifications: ['Professional Cleaning Certificate', 'Safety Training Completion'],
            achievements: ['Top performer for 3 consecutive months', '100+ satisfied customers', 'Eco-friendly cleaning specialist'],
            specializations: ['Deep Cleaning', 'Kitchen Cleaning', 'Bathroom Sanitization', 'Eco-friendly Products'],
            isVerified: true,
            verificationDate: new Date()
          }
        }
      }
    });

    const maidProfile = await ensureMaidProfile(maid.id, {
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
      serviceRadius: 5.0,
      experienceYears: 5,
      certifications: ['Professional Cleaning Certificate', 'Safety Training Completion'],
      achievements: ['Top performer for 3 consecutive months', '100+ satisfied customers', 'Eco-friendly cleaning specialist'],
      specializations: ['Deep Cleaning', 'Kitchen Cleaning', 'Bathroom Sanitization', 'Eco-friendly Products'],
      isVerified: true,
      verificationDate: new Date()
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
        maxDailyBookings: 20,
        isSubscriptionService: true // Mark as subscription service for automatic assignments
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

    // Create subscription plans - SweepPro Touch and SweepPro Lux
    const sweepProTouchPlan = await prisma.servicePlan.upsert({
      where: { id: 'sweepro-touch-plan' },
      update: {},
      create: {
        id: 'sweepro-touch-plan',
        name: 'SweepPro Touch',
        description: 'Premium silver plan for medium-sized homes. Enjoy enhanced cleaning and priority service.',
        serviceId: dailyCleaningService.id,

        sessionsPerWeek: 7,
        sessionsPerMonth: 30,
        duration: 1, // 1 month
        basePrice: 4500.0,
        discountPercent: 10.0,
        finalPrice: 4050.0, // 10% discount
        isActive: true,
        isPopular: false,
        bufferDaysAllowed: 0, // No buffer system for Touch
        hasBufferSystem: false
      }
    });

    const sweepProLuxPlan = await prisma.servicePlan.upsert({
      where: { id: 'sweepro-lux-plan' },
      update: {
        hasBufferSystem: true,
        bufferDaysAllowed: 3
      },
      create: {
        id: 'sweepro-lux-plan',
        name: 'Sweepro Lux',
        description: 'Ultimate cleaning experience for large homes and villas with luxury service.',
        serviceId: deepCleaningService.id,

        sessionsPerWeek: 4,
        sessionsPerMonth: 16,
        duration: 1, // 1 month
        basePrice: 2499.0,
        discountPercent: 20.0,
        finalPrice: 1999.0, // 20% discount
        isActive: true,
        isPopular: true,
        bufferDaysAllowed: 3, // Lux has 3 buffer days
        hasBufferSystem: true
      }
    });

    // Only SweepPro Touch and SweepPro Lux plans are kept

    console.log('✅ Database seeded successfully!');
    console.log('📄 Created:');
    console.log('- Admin user: admin@sweepro.com (password: admin123)');
    console.log('- Customer user: customer@sweepro.com (password: customer123)');
    console.log('- Maid user: maid@sweepro.com (password: maid123)');
    console.log('- 3 Services: Daily Cleaning, Deep Cleaning, Maintenance');

    console.log('- 2 Active Subscription Plans: SweepPro Touch (₹4,050/month), SweepPro Lux (₹6,800/month)');

    // Create subscriptions for all customers
    console.log('\n📋 Creating subscriptions and payments for customers...');
    
    // Subscribe customer1 to SweepPro Touch plan
    const customer1Profile = await ensureCustomerProfile(customer.id);
    
    const subscriptionEndDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const subscriptionStartDate = new Date();
    
    
    const subscription1 = await prisma.subscription.upsert({
      where: { customerId: customer1Profile.id },
      update: {
        planId: sweepProTouchPlan.id,
        status: 'ACTIVE',
        startDate: subscriptionStartDate,
        endDate: subscriptionEndDate,
        billingCycle: 'MONTHLY',
        amount: sweepProTouchPlan.finalPrice,
        discount: sweepProTouchPlan.basePrice - sweepProTouchPlan.finalPrice,
        autoRenew: true,
        nextBillDate: subscriptionEndDate,
        bufferDaysCount: 0,
        currentCycleStart: subscriptionStartDate,
        currentCycleEnd: subscriptionEndDate
      },
      create: {
        customerId: customer1Profile.id,
        planId: sweepProTouchPlan.id,
        status: 'ACTIVE',
        startDate: subscriptionStartDate,
        endDate: subscriptionEndDate,
        billingCycle: 'MONTHLY',
        amount: sweepProTouchPlan.finalPrice,
        discount: sweepProTouchPlan.basePrice - sweepProTouchPlan.finalPrice,
        autoRenew: true,
        nextBillDate: subscriptionEndDate,
        bufferDaysCount: 0,
        currentCycleStart: subscriptionStartDate,
        currentCycleEnd: subscriptionEndDate
      }
    });
    
    // Create subscription payment for customer1
    await prisma.payment.create({
      data: {
        subscriptionId: subscription1.id,
        customerId: customer.id,
        amount: sweepProTouchPlan.finalPrice,
        discount: sweepProTouchPlan.basePrice - sweepProTouchPlan.finalPrice,
        tax: 0,
        finalAmount: sweepProTouchPlan.finalPrice,
        paymentMethod: 'UPI',
        status: 'COMPLETED',
        paymentType: 'SUBSCRIPTION',
        gateway: 'razorpay',
        transactionId: 'txn_touch_' + Date.now()
      }
    });
    
    console.log('✅ Created subscription and payment for customer@sweepro.com (SweepPro Touch Plan)');

    // Get maid profile for assignment
    // Create maid assignment for customer
    const maidAssignment = await prisma.customerMaidAssignment.upsert({
      where: { customerId_isActive: { customerId: customer.id, isActive: true } },
      update: {
        maidId: maidProfile.id,
        isActive: true,
        notes: 'Assigned for SweepPro Touch subscription'
      },
      create: {
        customerId: customer.id,
        maidId: maidProfile.id,
        isActive: true,
        notes: 'Assigned for SweepPro Touch subscription'
      }
    });

    console.log('✅ Created maid assignment for customer@sweepro.com (Assigned to: Sarah Maid)');

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
        name: 'Priya Sharma',
        password: await bcrypt.hash('maid2123', 10),
        phone: '9123456783',
        role: 'MAID',
        address: '789 Service Lane, Worker Area',
        addressLine: 'Apartment 305, Service Complex',
        locality: 'Worker Area',
        city: 'Bangalore',
        state: 'Karnataka',
        pincode: '560003',
        latitude: 12.9718,
        longitude: 77.5948,
        profileImage: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Priya',
        bio: 'Expert in deep cleaning and specialized services. 4+ years experience with premium homes.',
        gender: 'Female',
        isProfilePublic: true,
        maidProfile: {
          create: {
            skills: ['house_cleaning', 'deep_cleaning', 'kitchen_cleaning'],
            languages: ['English', 'Hindi', 'Kannada'],
            availability: {
              monday: { start: '08:00', end: '18:00' },
              tuesday: { start: '08:00', end: '18:00' },
              wednesday: { start: '08:00', end: '18:00' },
              thursday: { start: '08:00', end: '18:00' },
              friday: { start: '08:00', end: '18:00' },
              saturday: { start: '10:00', end: '16:00' }
            },
            rating: 4.8,
            totalRatings: 25,
            status: 'ACTIVE',
            hourlyRate: 180.0,
            serviceRadius: 8.0,
            experienceYears: 4,
            certifications: ['Advanced Cleaning Techniques', 'Customer Service Excellence'],
            achievements: ['Top performer for 2 consecutive months', '50+ satisfied customers', 'Specialized in luxury homes'],
            specializations: ['Deep Cleaning', 'Luxury Home Cleaning', 'Eco-friendly Services'],
            isVerified: true,
            verificationDate: new Date()
          }
        }
      }
    });
    // Subscribe customer2 to SweepPro Lux plan
    const customer2Profile = await ensureCustomerProfile(user2.id);
    
    const subscription2EndDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const subscription2StartDate = new Date();
    
    const subscription2 = await prisma.subscription.upsert({
      where: { customerId: customer2Profile.id },
      update: {
        planId: sweepProLuxPlan.id,
        status: 'ACTIVE',
        startDate: subscription2StartDate,
        endDate: subscription2EndDate,
        billingCycle: 'MONTHLY',
        amount: sweepProLuxPlan.finalPrice,
        discount: sweepProLuxPlan.basePrice - sweepProLuxPlan.finalPrice,
        autoRenew: true,
        nextBillDate: subscription2EndDate,
        bufferDaysCount: 5,
        currentCycleStart: subscription2StartDate,
        currentCycleEnd: subscription2EndDate
      },
      create: {
        customerId: customer2Profile.id,
        planId: sweepProLuxPlan.id,
        status: 'ACTIVE',
        startDate: subscription2StartDate,
        endDate: subscription2EndDate,
        billingCycle: 'MONTHLY',
        amount: sweepProLuxPlan.finalPrice,
        discount: sweepProLuxPlan.basePrice - sweepProLuxPlan.finalPrice,
        autoRenew: true,
        nextBillDate: subscription2EndDate,
        bufferDaysCount: 5,
        currentCycleStart: subscription2StartDate,
        currentCycleEnd: subscription2EndDate
      }
    });
    
    // Create subscription payment for customer2
    await prisma.payment.create({
      data: {
        subscriptionId: subscription2.id,
        customerId: user2.id,
        amount: sweepProLuxPlan.finalPrice,
        discount: sweepProLuxPlan.basePrice - sweepProLuxPlan.finalPrice,
        tax: 0,
        finalAmount: sweepProLuxPlan.finalPrice,
        paymentMethod: 'CARD',
        status: 'COMPLETED',
        paymentType: 'SUBSCRIPTION',
        gateway: 'stripe',
        transactionId: 'txn_lux_' + Date.now()
      }
    });
    
    console.log('✅ Created subscription and payment for customer2@sweepro.com (SweepPro Lux Plan)');

    // Get maid2 profile and assign to customer2
    const maid2Profile = await ensureMaidProfile(maid2.id, {
      skills: ['house_cleaning', 'deep_cleaning', 'kitchen_cleaning'],
      languages: ['English', 'Hindi', 'Kannada'],
      availability: {
        monday: { start: '08:00', end: '18:00' },
        tuesday: { start: '08:00', end: '18:00' },
        wednesday: { start: '08:00', end: '18:00' },
        thursday: { start: '08:00', end: '18:00' },
        friday: { start: '08:00', end: '18:00' },
        saturday: { start: '10:00', end: '16:00' }
      },
      rating: 4.8,
      totalRatings: 25,
      status: 'ACTIVE',
      hourlyRate: 180.0,
      serviceRadius: 8.0,
      experienceYears: 4,
      certifications: ['Advanced Cleaning Techniques', 'Customer Service Excellence'],
      achievements: ['Top performer for 2 consecutive months', '50+ satisfied customers', 'Specialized in luxury homes'],
      specializations: ['Deep Cleaning', 'Luxury Home Cleaning', 'Eco-friendly Services'],
      isVerified: true,
      verificationDate: new Date()
    });

    // Create maid assignment for customer2
    await prisma.customerMaidAssignment.upsert({
      where: { customerId_isActive: { customerId: user2.id, isActive: true } },
      update: {
        maidId: maid2Profile.id,
        isActive: true,
        notes: 'Assigned for SweepPro Lux subscription'
      },
      create: {
        customerId: user2.id,
        maidId: maid2Profile.id,
        isActive: true,
        notes: 'Assigned for SweepPro Lux subscription'
      }
    });

    console.log('✅ Created maid assignment for customer2@sweepro.com (Assigned to: Priya Maid)');

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
    // Subscribe customer3 to SweepPro Touch plan
    const customer3Profile = await ensureCustomerProfile(user3.id);
    
    const subscription3EndDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const subscription3StartDate = new Date();
    
    const subscription3 = await prisma.subscription.upsert({
      where: { customerId: customer3Profile.id },
      update: {
        planId: sweepProTouchPlan.id,
        status: 'ACTIVE',
        startDate: subscription3StartDate,
        endDate: subscription3EndDate,
        billingCycle: 'MONTHLY',
        amount: sweepProTouchPlan.finalPrice,
        discount: sweepProTouchPlan.basePrice - sweepProTouchPlan.finalPrice,
        autoRenew: true,
        nextBillDate: subscription3EndDate
      },
      create: {
        customerId: customer3Profile.id,
        planId: sweepProTouchPlan.id,
        status: 'ACTIVE',
        startDate: subscription3StartDate,
        endDate: subscription3EndDate,
        billingCycle: 'MONTHLY',
        amount: sweepProTouchPlan.finalPrice,
        discount: sweepProTouchPlan.basePrice - sweepProTouchPlan.finalPrice,
        autoRenew: true,
        nextBillDate: subscription3EndDate
      }
    });
    
    // Create subscription payment for customer3
    await prisma.payment.create({
      data: {
        subscriptionId: subscription3.id,
        customerId: user3.id,
        amount: sweepProTouchPlan.finalPrice,
        discount: sweepProTouchPlan.basePrice - sweepProTouchPlan.finalPrice,
        tax: 0,
        finalAmount: sweepProTouchPlan.finalPrice,
        paymentMethod: 'NET_BANKING',
        status: 'COMPLETED',
        paymentType: 'SUBSCRIPTION',
        gateway: 'razorpay',
        transactionId: 'txn_standard_' + Date.now()
      }
    });
    
    console.log('✅ Created subscription and payment for customer3@sweepro.com (SweepPro Touch Plan)');

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
    // Subscribe customer4 to SweepPro Touch plan
    const customer4Profile = await ensureCustomerProfile(user4.id);
    
    const subscription4EndDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const subscription4StartDate = new Date();
    const subscription4 = await prisma.subscription.upsert({
      where: { customerId: customer4Profile.id },
      update: {
        planId: sweepProTouchPlan.id,
        status: 'ACTIVE',
        startDate: subscription4StartDate,
        endDate: subscription4EndDate,
        billingCycle: 'MONTHLY',
        amount: sweepProTouchPlan.finalPrice,
        discount: sweepProTouchPlan.basePrice - sweepProTouchPlan.finalPrice,
        autoRenew: true,
        nextBillDate: subscription4EndDate
      },
      create: {
        customerId: customer4Profile.id,
        planId: sweepProTouchPlan.id,
        status: 'ACTIVE',
        startDate: subscription4StartDate,
        endDate: subscription4EndDate,
        billingCycle: 'MONTHLY',
        amount: sweepProTouchPlan.finalPrice,
        discount: sweepProTouchPlan.basePrice - sweepProTouchPlan.finalPrice,
        autoRenew: true,
        nextBillDate: subscription4EndDate
      }
    });
    
    // Create subscription payment for customer4
    await prisma.payment.create({
      data: {
        subscriptionId: subscription4.id,
        customerId: user4.id,
        amount: sweepProTouchPlan.finalPrice,
        discount: sweepProTouchPlan.basePrice - sweepProTouchPlan.finalPrice,
        tax: 0,
        finalAmount: sweepProTouchPlan.finalPrice,
        paymentMethod: 'WALLET',
        status: 'COMPLETED',
        paymentType: 'SUBSCRIPTION',
        gateway: 'paytm',
        transactionId: 'txn_basic2_' + Date.now()
      }
    });
    
    console.log('✅ Created subscription and payment for customer4@sweepro.com (SweepPro Touch Plan)');

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
    // Subscribe customer5 to SweepPro Lux plan
    const customer5Profile = await ensureCustomerProfile(user5.id);
    
    const subscription5EndDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const subscription5StartDate = new Date();
    const subscription5 = await prisma.subscription.upsert({
      where: { customerId: customer5Profile.id },
      update: {
        planId: sweepProLuxPlan.id,
        status: 'ACTIVE',
        startDate: subscription5StartDate,
        endDate: subscription5EndDate,
        billingCycle: 'MONTHLY',
        amount: sweepProLuxPlan.finalPrice,
        discount: sweepProLuxPlan.basePrice - sweepProLuxPlan.finalPrice,
        autoRenew: true,
        nextBillDate: subscription5EndDate
      },
      create: {
        customerId: customer5Profile.id,
        planId: sweepProLuxPlan.id,
        status: 'ACTIVE',
        startDate: subscription5StartDate,
        endDate: subscription5EndDate,
        billingCycle: 'MONTHLY',
        amount: sweepProLuxPlan.finalPrice,
        discount: sweepProLuxPlan.basePrice - sweepProLuxPlan.finalPrice,
        autoRenew: true,
        nextBillDate: subscription5EndDate
      }
    });
    
    // Create subscription payment for customer5
    await prisma.payment.create({
      data: {
        subscriptionId: subscription5.id,
        customerId: user5.id,
        amount: sweepProLuxPlan.finalPrice,
        discount: sweepProLuxPlan.basePrice - sweepProLuxPlan.finalPrice,
        tax: 0,
        finalAmount: sweepProLuxPlan.finalPrice,
        paymentMethod: 'UPI',
        status: 'COMPLETED',
        paymentType: 'SUBSCRIPTION',
        gateway: 'razorpay',
        transactionId: 'txn_premium2_' + Date.now()
      }
    });
    
    console.log('✅ Created subscription and payment for customer5@sweepro.com (SweepPro Lux Plan)');

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
    console.log('  • customer@sweepro.com: SweepPro Touch Plan');
    console.log('  • customer2@sweepro.com: SweepPro Lux Plan');
    console.log('  • customer3@sweepro.com: SweepPro Touch Plan');
    console.log('  • customer4@sweepro.com: SweepPro Touch Plan');
    console.log('  • customer5@sweepro.com: SweepPro Lux Plan');
    
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
    
    const pendingCustomerProfile = await ensureCustomerProfile(customerPending.id);
    
    // Create pending subscription
    const pendingSubscription = await prisma.subscription.upsert({
      where: { customerId: pendingCustomerProfile.id },
      update: {},
      create: {
        customerId: pendingCustomerProfile.id,
        planId: sweepProLuxPlan.id,
        status: 'PENDING_PAYMENT',
        startDate: new Date(),
        endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        billingCycle: 'MONTHLY',
        amount: sweepProLuxPlan.finalPrice,
        discount: sweepProLuxPlan.basePrice - sweepProLuxPlan.finalPrice,
        autoRenew: true,
        nextBillDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      }
    });
    
    // Create pending payment for subscription
    await prisma.payment.create({
      data: {
        subscriptionId: pendingSubscription.id,
        customerId: customerPending.id,
        amount: sweepProLuxPlan.finalPrice,
        discount: sweepProLuxPlan.basePrice - sweepProLuxPlan.finalPrice,
        tax: 0,
        finalAmount: sweepProLuxPlan.finalPrice,
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
        amount: sweepProTouchPlan.finalPrice,
        discount: 0,
        tax: 0,
        finalAmount: sweepProTouchPlan.finalPrice,
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
        amount: sweepProLuxPlan.finalPrice,
        discount: 0,
        tax: 18.0, // GST
        finalAmount: sweepProLuxPlan.finalPrice + 18.0,
        paymentMethod: 'UPI',
        status: 'REFUNDED',
        paymentType: 'SUBSCRIPTION',
        gateway: 'razorpay',
        transactionId: 'txn_refunded_' + Date.now(),
        refundAmount: sweepProLuxPlan.finalPrice + 18.0,
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

    console.log('\n⭐ Creating sample feedback data...');

    const completedBookings = await prisma.booking.findMany({
      where: {
        status: 'COMPLETED',
        maidId: { not: null }
      },
      include: {
        customer: true,
        maid: true
      },
      take: 5
    });

    const feedbackData = [
      {
        overallRating: 5,
        qualityRating: 5,
        punctualityRating: 5,
        behaviorRating: 5,
        comment: 'Excellent service! The maid was very professional and thorough. Everything was cleaned perfectly.',
        improvements: null,
        wouldRecommend: true
      },
      {
        overallRating: 4,
        qualityRating: 4,
        punctualityRating: 5,
        behaviorRating: 4,
        comment: 'Great service overall. Very punctual and professional. Minor improvements could be made in deep cleaning corners.',
        improvements: 'Could pay more attention to hard-to-reach areas',
        wouldRecommend: true
      },
      {
        overallRating: 5,
        qualityRating: 5,
        punctualityRating: 4,
        behaviorRating: 5,
        comment: 'Outstanding work! Very satisfied with the cleaning quality. Highly recommend.',
        improvements: null,
        wouldRecommend: true
      },
      {
        overallRating: 3,
        qualityRating: 3,
        punctualityRating: 3,
        behaviorRating: 4,
        comment: 'Service was okay but could be better. Some areas were missed during cleaning.',
        improvements: 'Need more thorough cleaning, especially in bathrooms and kitchen',
        wouldRecommend: false
      },
      {
        overallRating: 4,
        qualityRating: 4,
        punctualityRating: 4,
        behaviorRating: 4,
        comment: 'Good service. Professional and courteous. Would use again.',
        improvements: null,
        wouldRecommend: true
      }
    ];

    let createdFeedbackCount = 0;

    for (let i = 0; i < completedBookings.length && i < feedbackData.length; i++) {
      const booking = completedBookings[i];
      const feedback = feedbackData[i];

      const existingFeedback = await prisma.feedback.findUnique({
        where: { bookingId: booking.id }
      });

      if (!existingFeedback && booking.maidId) {
        await prisma.feedback.create({
          data: {
            bookingId: booking.id,
            customerId: booking.customerId,
            overallRating: feedback.overallRating,
            qualityRating: feedback.qualityRating,
            punctualityRating: feedback.punctualityRating,
            behaviorRating: feedback.behaviorRating,
            comment: feedback.comment,
            improvements: feedback.improvements,
            wouldRecommend: feedback.wouldRecommend
          }
        });

        createdFeedbackCount++;
      }
    }

    const maidsWithCompletedBookings = await prisma.user.findMany({
      where: {
        role: 'MAID',
        maidBookings: {
          some: {
            status: 'COMPLETED'
          }
        }
      },
      select: {
        id: true,
        maidProfile: {
          select: { id: true }
        }
      }
    });

    for (const m of maidsWithCompletedBookings) {
      if (!m.maidProfile?.id) continue;

      const allFeedbacks = await prisma.feedback.findMany({
        where: {
          booking: {
            maidId: m.id,
            status: 'COMPLETED'
          }
        },
        select: {
          overallRating: true
        }
      });

      if (allFeedbacks.length === 0) continue;

      const averageRating = allFeedbacks.reduce((sum, f) => sum + f.overallRating, 0) / allFeedbacks.length;

      await prisma.maidProfile.update({
        where: { id: m.maidProfile.id },
        data: {
          rating: averageRating,
          totalRatings: allFeedbacks.length
        }
      });
    }

    console.log(`✅ Created ${createdFeedbackCount} feedback entries`);
    console.log('✅ Updated maid profile ratings based on feedback');

    console.log('\n💳 All customers now have active subscriptions and can create bookings!');
    console.log('\n🧪 Test Users Created:');
    console.log('- admin@sweepro.com (password: admin123) - Admin');
    console.log('- customer@sweepro.com (password: customer123) - Customer with SweepPro Touch Plan');
    console.log('- customer2@sweepro.com (password: customer2123) - Customer with SweepPro Lux Plan');
    console.log('- customer3@sweepro.com (password: customer3123) - Customer with SweepPro Touch Plan');
    console.log('- customer4@sweepro.com (password: customer4123) - Customer with SweepPro Touch Plan');
    console.log('- customer5@sweepro.com (password: customer5123) - Customer with SweepPro Lux Plan');
    console.log('- pending@sweepro.com (password: pending123) - Customer with Pending Payment');
    console.log('- maid@sweepro.com (password: maid123) - Maid');
    console.log('- maid2@sweepro.com (password: maid2123) - Maid');
    console.log('- maid3@sweepro.com (password: maid3123) - Maid');
    console.log('- maid4@sweepro.com (password: maid4123) - Maid');
    console.log('- maid5@sweepro.com (password: maid5123) - Maid');

    // Now create comprehensive buffer period test scenarios
    console.log('\n🛡️ Creating buffer period test scenarios...');
    
    // Clean up any existing buffer period test data to prevent conflicts
    await prisma.bufferPeriod.deleteMany({
      where: {
        subscription: {
          customer: {
            user: {
              email: {
                in: ['buffer@sweepro.com', 'expired@sweepro.com', 'cancelled@sweepro.com', 'paused@sweepro.com']
              }
            }
          }
        }
      }
    });
    
    // Clean up existing subscription cycles for buffer test users
    await prisma.subscriptionCycle.deleteMany({
      where: {
        subscription: {
          customer: {
            user: {
              email: {
                in: ['buffer@sweepro.com', 'expired@sweepro.com', 'cancelled@sweepro.com', 'paused@sweepro.com']
              }
            }
          }
        }
      }
    });
    
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
    
    const bufferCustomerProfile = await ensureCustomerProfile(bufferCustomer.id);
    
    // Create subscription with current buffer period
    const bufferSubscription = await prisma.subscription.upsert({
      where: { customerId: bufferCustomerProfile.id },
      update: {},
      create: {
        customerId: bufferCustomerProfile.id,
        planId: sweepProLuxPlan.id,
        status: 'ACTIVE',
        startDate: monthStart,
        endDate: nextMonthStart,
        billingCycle: 'MONTHLY',
        amount: sweepProLuxPlan.finalPrice,
        discount: sweepProLuxPlan.basePrice - sweepProLuxPlan.finalPrice,
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
    const bufferCurrentCycle = await prisma.subscriptionCycle.upsert({
      where: {
        subscriptionId_cycleNumber: {
          subscriptionId: bufferSubscription.id,
          cycleNumber: 3
        }
      },
      update: {},
      create: {
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
        amount: sweepProLuxPlan.finalPrice
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
    
    const expiredCustomerProfile = await ensureCustomerProfile(expiredCustomer.id);
    
    // Create expired subscription
    const expiredSubscription = await prisma.subscription.upsert({
      where: { customerId: expiredCustomerProfile.id },
      update: {},
      create: {
        customerId: expiredCustomerProfile.id,
        planId: sweepProLuxPlan.id,
        status: 'EXPIRED',
        startDate: new Date(now.getTime() - 35 * 24 * 60 * 60 * 1000),
        endDate: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000), // Expired 5 days ago
        billingCycle: 'MONTHLY',
        amount: sweepProLuxPlan.finalPrice,
        discount: sweepProLuxPlan.basePrice - sweepProLuxPlan.finalPrice,
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
    
    const cancelledCustomerProfile = await ensureCustomerProfile(cancelledCustomer.id);
    
    // Create cancelled subscription
    const cancelledSubscription = await prisma.subscription.upsert({
      where: { customerId: cancelledCustomerProfile.id },
      update: {},
      create: {
        customerId: cancelledCustomerProfile.id,
        planId: sweepProLuxPlan.id,
        status: 'CANCELLED',
        startDate: new Date(now.getTime() - 20 * 24 * 60 * 60 * 1000),
        endDate: new Date(now.getTime() + 10 * 24 * 60 * 60 * 1000),
        billingCycle: 'MONTHLY',
        amount: sweepProLuxPlan.finalPrice,
        discount: sweepProLuxPlan.basePrice - sweepProLuxPlan.finalPrice,
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
    
    const pausedCustomerProfile = await ensureCustomerProfile(pausedCustomer.id);
    
    // Create paused subscription
    const pausedSubscription = await prisma.subscription.upsert({
      where: { customerId: pausedCustomerProfile.id },
      update: {},
      create: {
        customerId: pausedCustomerProfile.id,
        planId: sweepProLuxPlan.id,
        status: 'SUSPENDED',
        startDate: new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000),
        endDate: new Date(now.getTime() + 15 * 24 * 60 * 60 * 1000),
        billingCycle: 'MONTHLY',
        amount: sweepProLuxPlan.finalPrice,
        discount: sweepProLuxPlan.basePrice - sweepProLuxPlan.finalPrice,
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
        amount: sweepProLuxPlan.finalPrice,
        discount: sweepProLuxPlan.basePrice - sweepProLuxPlan.finalPrice,
        tax: 0,
        finalAmount: sweepProLuxPlan.finalPrice,
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
        amount: sweepProLuxPlan.finalPrice,
        discount: 0,
        tax: 0,
        finalAmount: sweepProLuxPlan.finalPrice,
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
        amount: sweepProLuxPlan.finalPrice,
        discount: sweepProLuxPlan.basePrice - sweepProLuxPlan.finalPrice,
        tax: 0,
        finalAmount: sweepProLuxPlan.finalPrice,
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
        amount: sweepProLuxPlan.finalPrice,
        discount: sweepProLuxPlan.basePrice - sweepProLuxPlan.finalPrice,
        tax: 0,
        finalAmount: sweepProLuxPlan.finalPrice,
        paymentMethod: 'CARD',
        status: 'REFUNDED',
        paymentType: 'SUBSCRIPTION',
        gateway: 'stripe',
        transactionId: 'txn_cancelled_refund_' + Date.now(),
        refundAmount: sweepProLuxPlan.finalPrice,
        refundReason: 'Subscription cancelled by customer',
        refundedAt: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000)
      }
    });
    
    // Paused customer payment (will be processed when resumed)
    await prisma.payment.create({
      data: {
        subscriptionId: pausedSubscription.id,
        customerId: pausedCustomer.id,
        amount: sweepProLuxPlan.finalPrice,
        discount: sweepProLuxPlan.basePrice - sweepProLuxPlan.finalPrice,
        tax: 0,
        finalAmount: sweepProLuxPlan.finalPrice,
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
    
    // Create new customers with SweepPro Touch and SweepPro Lux plans
    console.log('\n🆕 Creating customers with new SweepPro Touch and SweepPro Lux plans...');
    
    // Customer with SweepPro Touch plan - 2BHK Apartment
    const touchCustomer = await prisma.user.upsert({
      where: { email: 'touch@sweepro.com' },
      update: {},
      create: {
        email: 'touch@sweepro.com',
        name: 'Touch Plan Customer',
        password: await bcrypt.hash('touch123', 10),
        phone: '9123456794',
        role: 'CUSTOMER',
        address: '600 Touch Avenue, Apartment 2B, Test City',
        latitude: 12.9730,
        longitude: 77.5960,
        timeSlot: '09:00-12:00',
        customerProfile: {
          create: {
            preferences: { preferredTime: 'morning', cleaningIntensity: 'regular' },
            emergencyContact: '9876543294',



          }
        }
      }
    });
    
    const touchCustomerProfile = await ensureCustomerProfile(touchCustomer.id);
    
    const touchSubscription = await prisma.subscription.upsert({
      where: { customerId: touchCustomerProfile.id },
      update: {},
      create: {
        customerId: touchCustomerProfile.id,
        planId: sweepProTouchPlan.id,
        status: 'ACTIVE',
        startDate: new Date(),
        endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        billingCycle: 'MONTHLY',
        amount: sweepProTouchPlan.finalPrice,
        discount: sweepProTouchPlan.basePrice - sweepProTouchPlan.finalPrice,
        autoRenew: true,
        nextBillDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        bufferDaysCount: 0, // No buffer for Touch
        currentCycleStart: new Date(),
        currentCycleEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      }
    });
    
    await prisma.payment.create({
      data: {
        subscriptionId: touchSubscription.id,
        customerId: touchCustomer.id,
        amount: sweepProTouchPlan.finalPrice,
        discount: sweepProTouchPlan.basePrice - sweepProTouchPlan.finalPrice,
        tax: 0,
        finalAmount: sweepProTouchPlan.finalPrice,
        paymentMethod: 'UPI',
        status: 'COMPLETED',
        paymentType: 'SUBSCRIPTION',
        gateway: 'razorpay',
        transactionId: 'txn_touch_' + Date.now()
      }
    });
    
    console.log('✅ Created SweepPro Touch subscription for touch@sweepro.com (₹4,050/month - No Buffer System)');
    
    // Customer with SweepPro Lux plan - 4BHK Bungalow
    const luxCustomer = await prisma.user.upsert({
      where: { email: 'lux@sweepro.com' },
      update: {},
      create: {
        email: 'lux@sweepro.com',
        name: 'Lux Plan Customer',
        password: await bcrypt.hash('lux123', 10),
        phone: '9123456795',
        role: 'CUSTOMER',
        address: '700 Luxury Villa, Premium District',
        latitude: 12.9731,
        longitude: 77.5961,
        timeSlot: '14:00-17:00',
        customerProfile: {
          create: {
            preferences: { preferredTime: 'afternoon', cleaningIntensity: 'deep' },
            emergencyContact: '9876543295',



          }
        }
      }
    });
    
    const luxCustomerProfile = await ensureCustomerProfile(luxCustomer.id);
    
    const luxSubscription = await prisma.subscription.upsert({
      where: { customerId: luxCustomerProfile.id },
      update: {},
      create: {
        customerId: luxCustomerProfile.id,
        planId: sweepProLuxPlan.id,
        status: 'ACTIVE',
        startDate: new Date(),
        endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        billingCycle: 'MONTHLY',
        amount: sweepProLuxPlan.finalPrice,
        discount: sweepProLuxPlan.basePrice - sweepProLuxPlan.finalPrice,
        autoRenew: true,
        nextBillDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        bufferDaysCount: 5, // Lux has 5 buffer days
        bufferDaysUsed: 0,
        currentCycleStart: new Date(),
        currentCycleEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      }
    });
    
    await prisma.payment.create({
      data: {
        subscriptionId: luxSubscription.id,
        customerId: luxCustomer.id,
        amount: sweepProLuxPlan.finalPrice,
        discount: sweepProLuxPlan.basePrice - sweepProLuxPlan.finalPrice,
        tax: 0,
        finalAmount: sweepProLuxPlan.finalPrice,
        paymentMethod: 'CARD',
        status: 'COMPLETED',
        paymentType: 'SUBSCRIPTION',
        gateway: 'stripe',
        transactionId: 'txn_lux_' + Date.now()
      }
    });
    
    console.log('✅ Created SweepPro Lux subscription for lux@sweepro.com (₹6,800/month - 5 Buffer Days)');
    
    // Create more diverse test users with different house types
    console.log('\n🏠 Creating diverse customers with various property types...');
    
    // 1BHK Apartment - Touch Plan
    const touch1bhk = await prisma.user.upsert({
      where: { email: 'touch.1bhk@sweepro.com' },
      update: {},
      create: {
        email: 'touch.1bhk@sweepro.com',
        name: 'Rajesh Kumar',
        password: await bcrypt.hash('touch123', 10),
        phone: '9123456796',
        role: 'CUSTOMER',
        address: '101 Compact Homes, Whitefield, Bangalore',
        latitude: 12.9698,
        longitude: 77.7500,
        timeSlot: '08:00-11:00',
        customerProfile: {
          create: {
            preferences: { preferredTime: 'morning', cleaningIntensity: 'regular' },
            emergencyContact: '9876543296',



          }
        }
      }
    });
    
    const touch1bhkProfile = await ensureCustomerProfile(touch1bhk.id);
    
    await prisma.subscription.upsert({
      where: { customerId: touch1bhkProfile.id },
      update: {},
      create: {
        customerId: touch1bhkProfile.id,
        planId: sweepProTouchPlan.id,
        status: 'ACTIVE',
        startDate: new Date(),
        endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        billingCycle: 'MONTHLY',
        amount: 3500.0, // Lower price for 1BHK
        discount: 450.0,
        autoRenew: true,
        nextBillDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        bufferDaysCount: 0,
        currentCycleStart: new Date(),
        currentCycleEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      }
    });
    
    // 3BHK Apartment - Lux Plan
    const lux3bhk = await prisma.user.upsert({
      where: { email: 'lux.3bhk@sweepro.com' },
      update: {},
      create: {
        email: 'lux.3bhk@sweepro.com',
        name: 'Priya Sharma',
        password: await bcrypt.hash('lux123', 10),
        phone: '9123456797',
        role: 'CUSTOMER',
        address: '305 Prestige Towers, Koramangala, Bangalore',
        latitude: 12.9352,
        longitude: 77.6245,
        timeSlot: '10:00-13:00',
        customerProfile: {
          create: {
            preferences: { preferredTime: 'morning', cleaningIntensity: 'deep' },
            emergencyContact: '9876543297',



          }
        }
      }
    });
    
    const lux3bhkProfile = await ensureCustomerProfile(lux3bhk.id);
    
    // Create active Lux subscription for lux.3bhk and keep reference for payments/bookings
    const lux3Subscription = await prisma.subscription.upsert({
      where: { customerId: lux3bhkProfile.id },
      update: {},
      create: {
        customerId: lux3bhkProfile.id,
        planId: sweepProLuxPlan.id,
        status: 'ACTIVE',
        startDate: new Date(),
        endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        billingCycle: 'MONTHLY',
        amount: 5800.0, // Mid-range price for 3BHK
        discount: 1200.0,
        autoRenew: true,
        nextBillDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        bufferDaysCount: 5,
        bufferDaysUsed: 1,
        currentCycleStart: new Date(),
        currentCycleEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      }
    });

    // Create a completed payment for Lux 3BHK subscription (dummy now; gateway integration later)
    await prisma.payment.create({
      data: {
        subscriptionId: lux3Subscription.id,
        customerId: lux3bhk.id,
        amount: 5800.0,
        discount: 0,
        tax: 0,
        finalAmount: 5800.0,
        paymentMethod: 'CARD',
        status: 'COMPLETED',
        paymentType: 'SUBSCRIPTION',
        gateway: 'razorpay',
        transactionId: 'txn_lux3bhk_' + Date.now()
      }
    });

    // Create sample bookings for Lux 3BHK user: 1 completed past, 1 upcoming confirmed, 1 assigned
    await prisma.booking.create({
      data: {
        customer: { connect: { id: lux3bhk.id } },
        maid: undefined,
        service: { connect: { id: deepCleaningService.id } },
        status: 'COMPLETED',
        priority: 'NORMAL',
        scheduledAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
        estimatedDuration: 240,
        serviceAddress: '305 Prestige Towers, Koramangala, Bangalore',
        serviceLatitude: 12.9352,
        serviceLongitude: 77.6245,
        totalAmount: 500.0,
        discount: 0,
        finalAmount: 500.0
      }
    });

    await prisma.booking.create({
      data: {
        customer: { connect: { id: lux3bhk.id } },
        maid: undefined,
        service: { connect: { id: deepCleaningService.id } },
        status: 'CONFIRMED',
        priority: 'HIGH',
        scheduledAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
        estimatedDuration: 240,
        serviceAddress: '305 Prestige Towers, Koramangala, Bangalore',
        serviceLatitude: 12.9352,
        serviceLongitude: 77.6245,
        totalAmount: 500.0,
        discount: 0,
        finalAmount: 500.0
      }
    });

    await prisma.booking.create({
      data: {
        customer: { connect: { id: lux3bhk.id } },
        maid: undefined,
        service: { connect: { id: dailyCleaningService.id } },
        status: 'ASSIGNED',
        priority: 'NORMAL',
        scheduledAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
        estimatedDuration: 120,
        serviceAddress: '305 Prestige Towers, Koramangala, Bangalore',
        serviceLatitude: 12.9352,
        serviceLongitude: 77.6245,
        totalAmount: 200.0,
        discount: 0,
        finalAmount: 200.0
      }
    });
    
    // 2BHK Bungalow - Lux Plan
    const luxBungalow = await prisma.user.upsert({
      where: { email: 'lux.bungalow@sweepro.com' },
      update: {},
      create: {
        email: 'lux.bungalow@sweepro.com',
        name: 'Amit Patel',
        password: await bcrypt.hash('lux123', 10),
        phone: '9123456798',
        role: 'CUSTOMER',
        address: 'Villa 12, Green Valley Estate, Sarjapur Road',
        latitude: 12.9010,
        longitude: 77.7330,
        timeSlot: '15:00-18:00',
        customerProfile: {
          create: {
            preferences: { preferredTime: 'afternoon', cleaningIntensity: 'deep' },
            emergencyContact: '9876543298',



          }
        }
      }
    });
    
    const luxBungalowProfile = await ensureCustomerProfile(luxBungalow.id);
    
    await prisma.subscription.upsert({
      where: { customerId: luxBungalowProfile.id },
      update: {},
      create: {
        customerId: luxBungalowProfile.id,
        planId: sweepProLuxPlan.id,
        status: 'ACTIVE',
        startDate: new Date(),
        endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        billingCycle: 'MONTHLY',
        amount: 6200.0, // Higher price for bungalow
        discount: 1300.0,
        autoRenew: true,
        nextBillDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        bufferDaysCount: 5,
        bufferDaysUsed: 0,
        currentCycleStart: new Date(),
        currentCycleEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      }
    });
    
    // 3BHK Bungalow - Lux Plan (Premium)
    const luxPremiumBungalow = await prisma.user.upsert({
      where: { email: 'lux.premium@sweepro.com' },
      update: {},
      create: {
        email: 'lux.premium@sweepro.com',
        name: 'Sunita Reddy',
        password: await bcrypt.hash('lux123', 10),
        phone: '9123456799',
        role: 'CUSTOMER',
        address: 'Bungalow 7, Palm Meadows, Whitefield',
        latitude: 12.9850,
        longitude: 77.7490,
        timeSlot: '09:00-12:00',
        customerProfile: {
          create: {
            preferences: { preferredTime: 'morning', cleaningIntensity: 'deep' },
            emergencyContact: '9876543299',



          }
        }
      }
    });
    
    const luxPremiumProfile = await ensureCustomerProfile(luxPremiumBungalow.id);
    
    await prisma.subscription.upsert({
      where: { customerId: luxPremiumProfile.id },
      update: {},
      create: {
        customerId: luxPremiumProfile.id,
        planId: sweepProLuxPlan.id,
        status: 'ACTIVE',
        startDate: new Date(),
        endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        billingCycle: 'MONTHLY',
        amount: 7500.0, // Premium price for large bungalow
        discount: 1500.0,
        autoRenew: true,
        nextBillDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        bufferDaysCount: 5,
        bufferDaysUsed: 2,
        currentCycleStart: new Date(),
        currentCycleEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      }
    });
    
    console.log('✅ Created 4 additional diverse customers:');
    console.log('  • touch.1bhk@sweepro.com - 1BHK Apartment, 650 sqft (₹3,500/month)');
    console.log('  • lux.3bhk@sweepro.com - 3BHK Apartment, 1800 sqft (₹5,800/month + Buffer)');
    console.log('  • lux.bungalow@sweepro.com - 2BHK Bungalow, 2200 sqft (₹6,200/month + Buffer)');
    console.log('  • lux.premium@sweepro.com - 3BHK Bungalow, 3000 sqft (₹7,500/month + Buffer)');
    
    console.log('\n✅ Comprehensive seed data created successfully!');
    console.log('\n🧪 Test Scenarios Available:');
    console.log('\n📋 NEW SUBSCRIPTION PLANS:');
    console.log('- touch@sweepro.com: SweepPro Touch (₹4,050/month - NO BUFFER SYSTEM)');
    console.log('- lux@sweepro.com: SweepPro Lux (₹6,800/month - 5 BUFFER DAYS)');
    console.log('\n📋 SUBSCRIPTION STATUSES:');
    console.log('- customer@sweepro.com: ACTIVE subscription (SweepPro Touch)');
    console.log('- customer2@sweepro.com: ACTIVE subscription (SweepPro Lux)');
    console.log('- customer3@sweepro.com: ACTIVE subscription (SweepPro Touch)');
    console.log('- customer4@sweepro.com: ACTIVE subscription (SweepPro Touch)');
    console.log('- customer5@sweepro.com: ACTIVE subscription (SweepPro Lux)');
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
    
    console.log('\n📬 Creating sample notifications for testing...');
    
    const notifications = [
      // Customer Notifications (Unread)
      {
        userId: customer.id,
        type: 'BOOKING_CONFIRMED',
        title: 'Booking Confirmed',
        message: 'Your booking for Daily House Cleaning has been created successfully',
        data: { serviceName: 'Daily House Cleaning', amount: 200 },
        read: false,
        delivered: true,
        deliveredAt: new Date()
      },
      {
        userId: customer.id,
        type: 'MAID_ASSIGNED',
        title: 'Maid Assigned',
        message: 'Sarah Maid has been assigned to your booking',
        data: { maidName: 'Sarah Maid', maidRating: 4.5 },
        read: false,
        delivered: true,
        deliveredAt: new Date()
      },
      {
        userId: customer.id,
        type: 'BOOKING_REMINDER',
        title: 'Service Reminder',
        message: 'Your Daily House Cleaning service is scheduled for tomorrow',
        data: { serviceName: 'Daily House Cleaning' },
        read: false,
        delivered: true,
        deliveredAt: new Date()
      },
      // Customer Notifications (Read)
      {
        userId: customer.id,
        type: 'PAYMENT_SUCCESS',
        title: 'Payment Received',
        message: 'Payment received successfully for SweepPro Touch Plan',
        data: { planName: 'SweepPro Touch' },
        read: true,
        readAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
        delivered: true,
        deliveredAt: new Date(Date.now() - 2 * 60 * 60 * 1000)
      },
      {
        userId: customer.id,
        type: 'SUBSCRIPTION_RENEWED',
        title: 'Subscription Activated',
        message: 'Your SweepPro Touch subscription is now active',
        data: { planName: 'SweepPro Touch' },
        read: true,
        readAt: new Date(Date.now() - 3 * 60 * 60 * 1000),
        delivered: true,
        deliveredAt: new Date(Date.now() - 3 * 60 * 60 * 1000)
      },
      // Maid Notifications
      {
        userId: maid.id,
        type: 'SERVICE_ASSIGNED',
        title: 'New Service Assignment',
        message: 'You have been assigned to a new service: Daily House Cleaning',
        data: { serviceName: 'Daily House Cleaning', customerAddress: '123 Main Street' },
        read: false,
        delivered: true,
        deliveredAt: new Date()
      },
      {
        userId: maid.id,
        type: 'BOOKING_REMINDER',
        title: 'Shift Reminder',
        message: 'Your shift starts in 2 hours at 123 Main Street',
        data: { customerAddress: '123 Main Street' },
        read: false,
        delivered: true,
        deliveredAt: new Date()
      },
      {
        userId: maid.id,
        type: 'FEEDBACK_REQUEST',
        title: 'Great Job!',
        message: 'You received a 5-star rating! Keep up the excellent work!',
        data: { rating: 5 },
        read: true,
        readAt: new Date(Date.now() - 1 * 60 * 60 * 1000),
        delivered: true,
        deliveredAt: new Date(Date.now() - 1 * 60 * 60 * 1000)
      },
      // Admin Notifications
      {
        userId: admin.id,
        type: 'BOOKING_CONFIRMED',
        title: 'New Booking Created',
        message: 'New booking for Daily House Cleaning by John Customer',
        data: { customerName: 'John Customer', serviceName: 'Daily House Cleaning' },
        read: false,
        delivered: true,
        deliveredAt: new Date()
      },
      {
        userId: admin.id,
        type: 'PAYMENT_SUCCESS',
        title: 'Payment Confirmation',
        message: 'Payment received from customer',
        data: { customerName: 'John Customer' },
        read: false,
        delivered: true,
        deliveredAt: new Date()
      },
      {
        userId: admin.id,
        type: 'SUBSCRIPTION_RENEWED',
        title: 'New Subscription',
        message: 'New subscription created: SweepPro Touch',
        data: { planName: 'SweepPro Touch', customerName: 'John Customer' },
        read: true,
        readAt: new Date(Date.now() - 1 * 60 * 60 * 1000),
        delivered: true,
        deliveredAt: new Date(Date.now() - 1 * 60 * 60 * 1000)
      },
      {
        userId: admin.id,
        type: 'SYSTEM_ALERT',
        title: 'System Health Check',
        message: 'All systems operational',
        data: { status: 'healthy' },
        read: true,
        readAt: new Date(Date.now() - 3 * 60 * 60 * 1000),
        delivered: true,
        deliveredAt: new Date(Date.now() - 3 * 60 * 60 * 1000)
      }
    ];

    for (const notification of notifications) {
      await prisma.notification.create({ data: notification });
    }

    console.log(`✅ Created ${notifications.length} sample notifications`);
    console.log('  • Customer: 5 notifications (3 unread, 2 read)');
    console.log('  • Maid: 3 notifications (2 unread, 1 read)');
    console.log('  • Admin: 4 notifications (2 unread, 2 read)');
    
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
    console.log('\n📬 NOTIFICATION SYSTEM TESTING:');
    console.log('11. Test notification endpoints: GET /api/notifications');
    console.log('12. Check unread count: GET /api/notifications/unread/count');
    console.log('13. Test WebSocket real-time delivery at ws://localhost:3000');
    console.log('14. Admin can send test notifications and broadcasts');
    console.log('15. Import Postman collection from: postman/Sweep-Pro-Notifications.postman_collection.json');
    
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
