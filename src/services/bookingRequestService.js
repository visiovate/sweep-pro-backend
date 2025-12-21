const { PrismaClient } = require('@prisma/client');
const { scheduleAssignmentRequest } = require('../queues/assignmentQueue');
const { 
  getNextServiceDateTime, 
  calculateRequestTime,
  ASSIGNMENT_REQUEST_HOURS_BEFORE,
  formatInIST
} = require('../utils/timeSlotUtils');

const prisma = new PrismaClient();

/**
 * Booking Request Service
 * 
 * Handles automatic booking request generation and scheduling
 * - Schedules booking requests 20 hours before customer's preferred time slot (IST)
 * - Creates booking and assignment request entries
 * - Integrates with BullMQ for reliable scheduling
 */

/**
 * Schedule booking requests for all active customer-maid assignments
 * This should be called periodically (e.g., every hour) to catch new assignments
 */
const scheduleAllBookingRequests = async () => {
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║  📅 SCHEDULING AUTOMATIC BOOKING REQUESTS               ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  try {
    // Get all active customer-maid assignments
    const activeAssignments = await prisma.customerMaidAssignment.findMany({
      where: {
        isActive: true
      },
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            timeSlot: true,
            address: true
          }
        },
        maid: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                phone: true
              }
            }
          }
        }
      }
    });

    console.log(`📊 Found ${activeAssignments.length} active customer-maid assignments\n`);

    if (activeAssignments.length === 0) {
      console.log('ℹ️  No active assignments found. Nothing to schedule.\n');
      return {
        success: true,
        scheduled: 0,
        skipped: 0,
        errors: 0,
        details: []
      };
    }

    const results = [];
    let scheduled = 0;
    let skipped = 0;
    let errors = 0;

    for (const assignment of activeAssignments) {
      try {
        const result = await scheduleBookingRequestForAssignment(assignment);
        
        if (result.success) {
          if (result.action === 'scheduled') {
            scheduled++;
            console.log(`✅ [${scheduled}/${activeAssignments.length}] Scheduled: ${assignment.customer.name}`);
          } else if (result.action === 'skipped') {
            skipped++;
            console.log(`⏭️  [${skipped}/${activeAssignments.length}] Skipped: ${assignment.customer.name} - ${result.reason}`);
          }
        } else {
          errors++;
          console.log(`❌ [${errors}/${activeAssignments.length}] Error: ${assignment.customer.name} - ${result.error}`);
        }

        results.push(result);
      } catch (error) {
        errors++;
        console.error(`❌ Error processing ${assignment.customer.name}:`, error.message);
        results.push({
          success: false,
          customerId: assignment.customerId,
          customerName: assignment.customer.name,
          error: error.message
        });
      }
    }

    console.log('\n╔══════════════════════════════════════════════════════════╗');
    console.log('║  📊 SCHEDULING SUMMARY                                   ║');
    console.log('╠══════════════════════════════════════════════════════════╣');
    console.log(`║  ✅ Scheduled:  ${scheduled.toString().padEnd(42)}║`);
    console.log(`║  ⏭️  Skipped:    ${skipped.toString().padEnd(42)}║`);
    console.log(`║  ❌ Errors:     ${errors.toString().padEnd(42)}║`);
    console.log(`║  📋 Total:      ${activeAssignments.length.toString().padEnd(42)}║`);
    console.log('╚══════════════════════════════════════════════════════════╝\n');

    return {
      success: true,
      scheduled,
      skipped,
      errors,
      total: activeAssignments.length,
      details: results
    };
  } catch (error) {
    console.error('❌ Error in scheduleAllBookingRequests:', error);
    throw error;
  }
};

/**
 * Schedule a booking request for a single customer-maid assignment
 */
const scheduleBookingRequestForAssignment = async (assignment) => {
  const { customer, maid, customerId, maidId } = assignment;
  
  console.log(`\n🔍 Processing: ${customer.name} → ${maid.user.name}`);
  console.log(`   Customer Time Slot: ${customer.timeSlot || 'Not set'}`);

  // Validate time slot
  if (!customer.timeSlot) {
    return {
      success: false,
      action: 'skipped',
      customerId,
      customerName: customer.name,
      reason: 'No time slot configured',
      error: 'Time slot not set for customer'
    };
  }

  try {
    // Check if customer is in buffer period
    const isInBuffer = await checkCustomerBufferStatus(customerId);
    if (isInBuffer) {
      return {
        success: true,
        action: 'skipped',
        customerId,
        customerName: customer.name,
        reason: 'Customer in buffer period'
      };
    }

    // Calculate service date/time and request time (IST-aware)
    const serviceDateTime = getNextServiceDateTime(customer.timeSlot);
    const requestTime = calculateRequestTime(serviceDateTime);
    const now = new Date();

    console.log(`   📅 Next Service Time (IST): ${formatInIST(serviceDateTime)}`);
    console.log(`   ⏰ Request Time (IST): ${formatInIST(requestTime)}`);
    console.log(`   🕐 Current Time (IST): ${formatInIST(now)}`);

    // Check if request time is in the past
    if (requestTime < now) {
      const hoursUntilService = (serviceDateTime.getTime() - now.getTime()) / (1000 * 60 * 60);
      
      if (hoursUntilService <= 0) {
        return {
          success: true,
          action: 'skipped',
          customerId,
          customerName: customer.name,
          reason: 'Service time has passed'
        };
      }
      
      // If we're past request time but before service time, request should be sent immediately
      console.log(`   ⚠️  Request time has passed, but service is in ${hoursUntilService.toFixed(2)} hours`);
      console.log(`   🚀 Will send request immediately`);
    }

    // Check for existing pending assignment requests for this booking window
    const existingRequest = await prisma.assignmentRequest.findFirst({
      where: {
        maidId: maidId,
        status: 'pending',
        booking: {
          customerId: customerId,
          scheduledAt: {
            gte: new Date(serviceDateTime.getTime() - 3600000), // 1 hour before
            lte: new Date(serviceDateTime.getTime() + 3600000), // 1 hour after
          }
        }
      }
    });

    if (existingRequest) {
      return {
        success: true,
        action: 'skipped',
        customerId,
        customerName: customer.name,
        reason: 'Pending request already exists for this time window'
      };
    }

    // Check for existing booking for this time slot
    const existingBooking = await prisma.booking.findFirst({
      where: {
        customerId: customerId,
        scheduledAt: {
          gte: new Date(serviceDateTime.getTime() - 3600000),
          lte: new Date(serviceDateTime.getTime() + 3600000),
        },
        status: {
          in: ['PENDING', 'CONFIRMED', 'IN_PROGRESS']
        }
      }
    });

    if (existingBooking) {
      return {
        success: true,
        action: 'skipped',
        customerId,
        customerName: customer.name,
        reason: 'Booking already exists for this time window'
      };
    }

    // Schedule the assignment request via BullMQ
    const jobData = {
      customerId: customer.id,
      maidId: maid.id,
      maidUserId: maid.user.id,
      timeSlot: customer.timeSlot,
      customerName: customer.name,
      maidName: maid.user.name,
      serviceDateTime: serviceDateTime.toISOString(),
      requestTime: requestTime.toISOString()
    };

    console.log(`   📋 Scheduling job for: ${formatInIST(requestTime)}`);
    const job = await scheduleAssignmentRequest(jobData, requestTime);

    if (job?.skipped) {
      console.warn(`   [JOB SKIPPED] ${job.reason || 'VALIDATION_FAILED'} | customerId=${customer.id} maidId=${maid.id}`);
      return {
        success: true,
        action: 'skipped',
        customerId: customer.id,
        customerName: customer.name,
        maidId: maid.id,
        maidName: maid.user.name,
        reason: job.reason || 'Validation failed',
        serviceDateTime: serviceDateTime.toISOString(),
        requestTime: requestTime.toISOString(),
        jobId: null
      };
    }

    if (!job?.id) {
      return {
        success: false,
        action: 'error',
        customerId: customer.id,
        customerName: customer.name,
        error: 'Failed to schedule assignment job'
      };
    }

    console.log(`   ✅ Job scheduled successfully (Job ID: ${job.id})`);

    return {
      success: true,
      action: 'scheduled',
      customerId: customer.id,
      customerName: customer.name,
      maidId: maid.id,
      maidName: maid.user.name,
      timeSlot: customer.timeSlot,
      serviceDateTime: serviceDateTime.toISOString(),
      requestTime: requestTime.toISOString(),
      jobId: job.id
    };

  } catch (error) {
    console.error(`   ❌ Error scheduling for ${customer.name}:`, error.message);
    return {
      success: false,
      action: 'error',
      customerId,
      customerName: customer.name,
      error: error.message
    };
  }
};

/**
 * Check if customer is in an active buffer period
 */
const checkCustomerBufferStatus = async (customerId) => {
  try {
    const activeBuffer = await prisma.bufferPeriod.findFirst({
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

    if (activeBuffer) {
      console.log(`   ⏸️  Customer is in buffer period until ${formatInIST(activeBuffer.endDate)}`);
    }

    return !!activeBuffer;
  } catch (error) {
    console.error('   ⚠️  Error checking buffer status:', error.message);
    return false; // Don't block on error
  }
};

/**
 * Get upcoming booking requests for a customer
 */
const getUpcomingRequestsForCustomer = async (customerId) => {
  try {
    const requests = await prisma.assignmentRequest.findMany({
      where: {
        booking: {
          customerId: customerId
        },
        status: 'pending',
        expiresAt: {
          gt: new Date()
        }
      },
      include: {
        booking: {
          include: {
            service: true
          }
        },
        maid: {
          include: {
            user: true
          }
        }
      },
      orderBy: {
        requestedAt: 'desc'
      }
    });

    return requests;
  } catch (error) {
    console.error('Error getting upcoming requests:', error);
    throw error;
  }
};

/**
 * Get all pending assignment requests (for admin dashboard)
 */
const getAllPendingRequests = async () => {
  try {
    const requests = await prisma.assignmentRequest.findMany({
      where: {
        status: 'pending',
        expiresAt: {
          gt: new Date()
        }
      },
      include: {
        booking: {
          include: {
            service: true,
            customer: true
          }
        },
        maid: {
          include: {
            user: true
          }
        }
      },
      orderBy: {
        requestedAt: 'desc'
      }
    });

    return requests;
  } catch (error) {
    console.error('Error getting all pending requests:', error);
    throw error;
  }
};

/**
 * Cancel a scheduled booking request
 */
const cancelBookingRequest = async (assignmentRequestId) => {
  try {
    console.log(`\n🚫 Cancelling booking request: ${assignmentRequestId}`);

    const request = await prisma.assignmentRequest.findUnique({
      where: { id: assignmentRequestId },
      include: {
        booking: true
      }
    });

    if (!request) {
      throw new Error('Assignment request not found');
    }

    if (request.status !== 'pending') {
      throw new Error(`Cannot cancel request with status: ${request.status}`);
    }

    // Update assignment request to cancelled
    await prisma.assignmentRequest.update({
      where: { id: assignmentRequestId },
      data: {
        status: 'cancelled',
        respondedAt: new Date()
      }
    });

    // Update associated booking if it exists
    if (request.bookingId) {
      await prisma.booking.update({
        where: { id: request.bookingId },
        data: {
          status: 'CANCELLED',
          assignmentStatus: 'CANCELLED'
        }
      });
    }

    console.log(`✅ Booking request cancelled successfully`);

    return {
      success: true,
      message: 'Booking request cancelled successfully'
    };
  } catch (error) {
    console.error('❌ Error cancelling booking request:', error);
    throw error;
  }
};

module.exports = {
  scheduleAllBookingRequests,
  scheduleBookingRequestForAssignment,
  getUpcomingRequestsForCustomer,
  getAllPendingRequests,
  cancelBookingRequest,
  checkCustomerBufferStatus
};
