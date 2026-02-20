const { getPrismaClient } = require('../utils/database');
const { PrismaClient } = require('@prisma/client');
const { 
  getNextServiceDateTime, 
  calculateRequestTime,
  ASSIGNMENT_REQUEST_HOURS_BEFORE 
} = require('../utils/timeSlotUtils');

const prisma = getPrismaClient();

/**
 * Daily Booking Automation Script
 * 
 * This script should be run daily (e.g., via cron job) to create booking requests
 * for active customer-maid assignments 20 hours before their scheduled service time.
 * 
 * Usage: node src/scripts/daily-booking-automation.js
 */

async function runDailyBookingAutomation() {
  try {
    console.log(`🤖 Daily Booking Automation Started - ${new Date().toISOString()}`);
    console.log(`⏰ Creating booking requests ${ASSIGNMENT_REQUEST_HOURS_BEFORE} hours before service\n`);

    // Get default service
    let defaultService = await getPrismaClient().service.findFirst({
      where: {
        isActive: true,
        isSubscriptionService: true
      }
    });

    if (!defaultService) {
      defaultService = await getPrismaClient().service.findFirst({
        where: { isActive: true }
      });
    }

    if (!defaultService) {
      throw new Error('No active service found');
    }

    console.log(`🎯 Using service: ${defaultService.name} (${defaultService.id})\n`);

    // Get all active customer-maid assignments
    const activeAssignments = await getPrismaClient().customerMaidAssignment.findMany({
      where: { isActive: true },
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            timeSlot: true,
            address: true
          }
        },
        maid: {
          include: {
            user: {
              select: { id: true, name: true }
            }
          }
        }
      }
    });

    console.log(`👥 Found ${activeAssignments.length} active assignments`);

    const results = [];
    const errors = [];
    const skipped = [];

    for (const assignment of activeAssignments) {
      try {
        const timeSlot = assignment.customer.timeSlot;
        if (!timeSlot) {
          skipped.push({
            customerName: assignment.customer.name,
            reason: 'No time slot defined'
          });
          continue;
        }

        const serviceDateTime = getNextServiceDateTime(timeSlot);
        const requestTime = calculateRequestTime(serviceDateTime);
        const now = new Date();

        // Check if we're in the right time window to create the request
        const hoursUntilService = (serviceDateTime.getTime() - now.getTime()) / (1000 * 60 * 60);
        const shouldCreateNow = hoursUntilService <= ASSIGNMENT_REQUEST_HOURS_BEFORE && hoursUntilService > 0;

        if (!shouldCreateNow) {
          console.log(`⏸️ ${assignment.customer.name}: Not time yet (${hoursUntilService.toFixed(2)}h until service)`);
          continue;
        }

        // Check if request already exists
        const existingRequest = await getPrismaClient().assignmentRequest.findFirst({
          where: {
            maidId: assignment.maidId,
            status: 'pending',
            booking: {
              customerId: assignment.customerId,
              scheduledAt: {
                gte: new Date(serviceDateTime.getTime() - 3600000), // 1 hour before
                lte: new Date(serviceDateTime.getTime() + 3600000), // 1 hour after
              }
            }
          }
        });

        if (existingRequest) {
          skipped.push({
            customerName: assignment.customer.name,
            reason: 'Request already exists'
          });
          continue;
        }

        // Check if customer is in buffer period
        const isInBuffer = await checkCustomerBufferStatus(assignment.customerId);
        if (isInBuffer) {
          skipped.push({
            customerName: assignment.customer.name,
            reason: 'Customer in buffer period'
          });
          continue;
        }

        console.log(`🔄 Creating request for ${assignment.customer.name} (${timeSlot})`);

        // Create booking
        const booking = await getPrismaClient().booking.create({
          data: {
            customerId: assignment.customerId,
            maidId: assignment.maid.user.id,
            serviceId: defaultService.id,
            scheduledAt: serviceDateTime,
            timeSlot: timeSlot,
            status: 'PENDING',
            assignmentStatus: 'PENDING_ASSIGNMENT',
            totalAmount: defaultService.basePrice,
            finalAmount: defaultService.basePrice,
            serviceAddress: assignment.customer.address || 'Customer Address',
            estimatedDuration: defaultService.baseDuration,
            specialInstructions: `Automatic booking for ${timeSlot} time slot`
          }
        });

        // Create assignment request
        const assignmentRequest = await getPrismaClient().assignmentRequest.create({
          data: {
            bookingId: booking.id,
            maidId: assignment.maidId,
            expiresAt: new Date(serviceDateTime.getTime() - (2 * 60 * 60 * 1000)), // Expires 2 hours before service
            status: 'pending'
          }
        });

        // Send notification to maid
        await getPrismaClient().notification.create({
          data: {
            userId: assignment.maid.user.id,
            type: 'SERVICE_ASSIGNED',
            title: 'New Booking Request',
            message: `You have a new booking request from ${assignment.customer.name} for ${timeSlot} time slot scheduled for ${serviceDateTime.toLocaleDateString()}.`,
            data: {
              bookingId: booking.id,
              assignmentRequestId: assignmentRequest.id,
              customerName: assignment.customer.name,
              timeSlot: timeSlot,
              scheduledAt: serviceDateTime.toISOString(),
              expiresAt: assignmentRequest.expiresAt.toISOString()
            }
          }
        });

        console.log(`✅ Created booking and request for ${assignment.customer.name} → ${assignment.maid.user.name}`);

        results.push({
          customerName: assignment.customer.name,
          maidName: assignment.maid.user.name,
          timeSlot,
          serviceDateTime: serviceDateTime.toISOString(),
          bookingId: booking.id,
          assignmentRequestId: assignmentRequest.id
        });

      } catch (error) {
        console.error(`❌ Error processing ${assignment.customer.name}:`, error.message);
        errors.push({
          customerName: assignment.customer.name,
          error: error.message
        });
      }
    }

    // Log summary
    console.log(`\n📊 Daily Automation Summary:`);
    console.log(`   ✅ Created: ${results.length} booking requests`);
    console.log(`   ⏸️ Skipped: ${skipped.length} assignments`);
    console.log(`   ❌ Errors: ${errors.length} failures`);

    if (results.length > 0) {
      console.log(`\n📋 Created Requests:`);
      results.forEach((result, index) => {
        console.log(`   ${index + 1}. ${result.customerName} → ${result.maidName} (${result.timeSlot})`);
      });
    }

    if (skipped.length > 0) {
      console.log(`\n⏸️ Skipped:`);
      skipped.forEach((skip, index) => {
        console.log(`   ${index + 1}. ${skip.customerName}: ${skip.reason}`);
      });
    }

    if (errors.length > 0) {
      console.log(`\n❌ Errors:`);
      errors.forEach((error, index) => {
        console.log(`   ${index + 1}. ${error.customerName}: ${error.error}`);
      });
    }

    console.log(`\n🎉 Daily automation completed at ${new Date().toISOString()}`);

    return {
      success: true,
      created: results.length,
      skipped: skipped.length,
      errors: errors.length,
      results,
      skippedDetails: skipped,
      errorDetails: errors
    };

  } catch (error) {
    console.error('❌ Daily automation failed:', error);
    throw error;
  } finally {
    await getPrismaClient().$disconnect();
  }
}

/**
 * Check if customer is in buffer period
 */
async function checkCustomerBufferStatus(customerId) {
  try {
    const activeBuffer = await getPrismaClient().bufferPeriod.findFirst({
      where: {
        subscription: {
          customer: {
            userId: customerId
          }
        },
        status: 'ACTIVE',
        endDate: {
          gte: new Date()
        }
      }
    });

    return !!activeBuffer;
  } catch (error) {
    console.error('Error checking buffer status:', error);
    return false;
  }
}

// Run the automation if this script is executed directly
if (require.main === module) {
  runDailyBookingAutomation()
    .then(result => {
      console.log('✅ Script completed successfully');
      process.exit(0);
    })
    .catch(error => {
      console.error('❌ Script failed:', error);
      process.exit(1);
    });
}

module.exports = { runDailyBookingAutomation };