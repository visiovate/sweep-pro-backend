const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function cleanupTestData() {
  console.log('🧹 Cleaning up existing test data...');
  
  try {
    // Clean up in correct order to avoid foreign key constraints
    
    // 1. Delete test bookings
    const deletedBookings = await prisma.booking.deleteMany({
      where: {
        customer: {
          email: {
            in: [
              'customer@sweepro.com',
              'customer2@sweepro.com', 
              'customer3@sweepro.com',
              'customer4@sweepro.com',
              'customer5@sweepro.com',
              'pending@sweepro.com'
            ]
          }
        }
      }
    });
    console.log(`✅ Deleted ${deletedBookings.count} test bookings`);

    // 2. Delete test payments
    const deletedPayments = await prisma.payment.deleteMany({
      where: {
        customer: {
          email: {
            in: [
              'customer@sweepro.com',
              'customer2@sweepro.com', 
              'customer3@sweepro.com',
              'customer4@sweepro.com',
              'customer5@sweepro.com',
              'pending@sweepro.com'
            ]
          }
        }
      }
    });
    console.log(`✅ Deleted ${deletedPayments.count} test payments`);

    // 3. Delete test subscriptions
    const deletedSubscriptions = await prisma.subscription.deleteMany({
      where: {
        customer: {
          user: {
            email: {
              in: [
                'customer@sweepro.com',
                'customer2@sweepro.com', 
                'customer3@sweepro.com',
                'customer4@sweepro.com',
                'customer5@sweepro.com',
                'pending@sweepro.com'
              ]
            }
          }
        }
      }
    });
    console.log(`✅ Deleted ${deletedSubscriptions.count} test subscriptions`);

    // 4. Delete test customer profiles
    const deletedCustomerProfiles = await prisma.customerProfile.deleteMany({
      where: {
        user: {
          email: {
            in: [
              'customer@sweepro.com',
              'customer2@sweepro.com', 
              'customer3@sweepro.com',
              'customer4@sweepro.com',
              'customer5@sweepro.com',
              'pending@sweepro.com'
            ]
          }
        }
      }
    });
    console.log(`✅ Deleted ${deletedCustomerProfiles.count} test customer profiles`);

    // 5. Delete test maid profiles
    const deletedMaidProfiles = await prisma.maidProfile.deleteMany({
      where: {
        user: {
          email: {
            in: [
              'maid@sweepro.com',
              'maid2@sweepro.com',
              'maid3@sweepro.com',
              'maid4@sweepro.com',
              'maid5@sweepro.com'
            ]
          }
        }
      }
    });
    console.log(`✅ Deleted ${deletedMaidProfiles.count} test maid profiles`);

    // 6. Delete test admin profiles
    const deletedAdminProfiles = await prisma.adminProfile.deleteMany({
      where: {
        user: {
          email: 'admin@sweepro.com'
        }
      }
    });
    console.log(`✅ Deleted ${deletedAdminProfiles.count} test admin profiles`);

    // 7. Delete test users
    const deletedUsers = await prisma.user.deleteMany({
      where: {
        email: {
          in: [
            'admin@sweepro.com',
            'customer@sweepro.com',
            'customer2@sweepro.com', 
            'customer3@sweepro.com',
            'customer4@sweepro.com',
            'customer5@sweepro.com',
            'pending@sweepro.com',
            'maid@sweepro.com',
            'maid2@sweepro.com',
            'maid3@sweepro.com',
            'maid4@sweepro.com',
            'maid5@sweepro.com'
          ]
        }
      }
    });
    console.log(`✅ Deleted ${deletedUsers.count} test users`);

    // 8. Delete test service plans
    const deletedServicePlans = await prisma.servicePlan.deleteMany({
      where: {
        name: {
          in: ['Basic Daily Cleaning', 'Premium Deep Cleaning', 'Standard Maintenance']
        }
      }
    });
    console.log(`✅ Deleted ${deletedServicePlans.count} test service plans`);

    // 9. Delete test services
    const deletedServices = await prisma.service.deleteMany({
      where: {
        name: {
          in: ['Daily House Cleaning', 'Deep Cleaning Service', 'Home Maintenance']
        }
      }
    });
    console.log(`✅ Deleted ${deletedServices.count} test services`);

    console.log('\n🎉 Cleanup completed successfully!');
    console.log('✅ All test data has been removed');
    console.log('🚀 Ready to run seed script again');

  } catch (error) {
    console.error('❌ Error during cleanup:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run cleanup if this script is executed directly
if (require.main === module) {
  cleanupTestData()
    .catch((error) => {
      console.error('❌ Cleanup failed:', error);
      process.exit(1);
    });
}

module.exports = { cleanupTestData };
