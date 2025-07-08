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
