const { getPrismaClient } = require('../utils/database');
const {
  parseTimeSlot,
  calculateRequestTime,
  getNextServiceDateTime,
  shouldCreateRequestNow,
  shouldSendRequestImmediately,
  getUniqueTimeSlots,
  ASSIGNMENT_REQUEST_HOURS_BEFORE
} = require('../utils/timeSlotUtils');
const cron = require('node-cron');
const bookingDeduplicationService = require('./bookingDeduplicationService');
const { queueRejectedAssignment } = require('../queues/adminReassignQueue');
const { isDateOnWeeklyOff } = require('../utils/weekdayUtils');

// Initialize Prisma using singleton
const prisma = getPrismaClient();

/**
 * Create automatic assignment requests for customers based on their time slots
 */
class AutomaticAssignmentService {
  
  /**
   * Process all customers and create assignment requests 20 hours before their time slot
   * Also sends requests immediately if server starts within 20 hours of service time
   */
  static async processAutomaticRequests() {
    try {
      console.log('🔄 Starting automatic assignment request processing...');
      
      // Get all active customer assignments
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

      console.log(`👥 Found ${activeAssignments.length} active customer assignments`);

      // Group customers by time slot
      const customersByTimeSlot = {};
      activeAssignments.forEach(assignment => {
        const timeSlot = assignment.customer.timeSlot || 'default';
        if (!customersByTimeSlot[timeSlot]) {
          customersByTimeSlot[timeSlot] = [];
        }
        customersByTimeSlot[timeSlot].push(assignment);
      });

      const results = [];
      const errors = [];

      // Process each time slot
      for (const [timeSlot, assignments] of Object.entries(customersByTimeSlot)) {
        try {
          console.log(`⏰ Processing time slot: ${timeSlot} (${assignments.length} customers)`);
          
          // Check if it's time to create requests for this time slot
          const shouldCreateNow = shouldCreateRequestNow(timeSlot);
          const shouldSendNow = shouldSendRequestImmediately(timeSlot);
          
          if (!shouldCreateNow && !shouldSendNow) {
            console.log(`⏸️ Not time yet for time slot ${timeSlot}`);
            continue;
          }

          if (shouldSendNow) {
            console.log(`🚨 IMMEDIATE SEND: Creating requests for time slot ${timeSlot} (server started within ${ASSIGNMENT_REQUEST_HOURS_BEFORE} hours)`);
          } else {
            console.log(`✅ SCHEDULED SEND: Creating requests for time slot ${timeSlot}`);
          }

          // Process each customer in this time slot
          for (const assignment of assignments) {
            try {
              const result = await this.createAssignmentRequestForCustomer(assignment, timeSlot);
              if (result.success) {
                results.push(result);
              } else {
                errors.push(result);
              }
            } catch (error) {
              console.error(`❌ Error processing customer ${assignment.customer.name}:`, error);
              errors.push({
                customerId: assignment.customerId,
                customerName: assignment.customer.name,
                error: error.message
              });
            }
          }

        } catch (error) {
          console.error(`❌ Error processing time slot ${timeSlot}:`, error);
        }
      }

      console.log(`✅ Automatic request processing completed. Created: ${results.length}, Errors: ${errors.length}`);

      return {
        success: true,
        created: results.length,
        errors: errors.length,
        results,
        errorDetails: errors
      };

    } catch (error) {
      console.error('❌ Automatic assignment request processing failed:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Create assignment request for a specific customer
   */
  static async createAssignmentRequestForCustomer(assignment, timeSlot) {
    try {
      const { customer, maid } = assignment;
      
      // Check if customer is in buffer period
      const isInBuffer = await this.checkCustomerBufferStatus(customer.id);
      if (isInBuffer) {
        console.log(`⏸️ Skipping ${customer.name} - in buffer period`);
        return {
          success: false,
          customerId: customer.id,
          customerName: customer.name,
          reason: 'Customer in buffer period'
        };
      }

      // Calculate service date and time
      const serviceDateTime = getNextServiceDateTime(timeSlot);
      
      // Check for duplicate booking request using Redis
      const isDuplicate = await bookingDeduplicationService.isDuplicate(
        customer.id,
        maid.id,
        serviceDateTime
      );

      if (isDuplicate) {
        console.log(`🚫 Duplicate booking request prevented for ${customer.name} on ${serviceDateTime.toISOString().split('T')[0]}`);
        return {
          success: false,
          customerId: customer.id,
          customerName: customer.name,
          reason: 'Duplicate request prevented by Redis deduplication'
        };
      }

      // Check if assignment request already exists for tomorrow
      const existingRequest = await prisma.customerAssignmentRequest.findFirst({
        where: {
          customerId: customer.id,
          maidId: maid.id,
          status: 'pending',
          createdAt: {
            gte: new Date(new Date().setHours(0, 0, 0, 0)) // Today
          }
        }
      });

      if (existingRequest) {
        console.log(`📋 Assignment request already exists for ${customer.name}`);
        return {
          success: false,
          customerId: customer.id,
          customerName: customer.name,
          reason: 'Request already exists for today'
        };
      }

      // Get default service - try subscription service first, then fallback to any active service
      let defaultService = await prisma.service.findFirst({
        where: {
          isActive: true,
          isSubscriptionService: true
        }
      });

      // Fallback: if no subscription service found, use any active service
      if (!defaultService) {
        console.log('⚠️ No subscription service found, using first available active service');
        defaultService = await prisma.service.findFirst({
          where: {
            isActive: true
          }
        });
      }

      // If still no service found, throw error
      if (!defaultService) {
        throw new Error('No active service found in database. Please create at least one service.');
      }

      console.log(`✅ Using service: ${defaultService.name} (ID: ${defaultService.id})`);

      const maidOnWeeklyOff = isDateOnWeeklyOff(serviceDateTime, assignment.maid?.weeklyOffDay);
      const maidUnavailable = assignment.maid?.availability && assignment.maid.availability.isAvailable === false;

      if (maidOnWeeklyOff || maidUnavailable) {
        const reason = maidOnWeeklyOff ? 'MAID_ON_LEAVE' : 'Maid unavailable';
        const booking = await prisma.booking.create({
          data: {
            customerId: customer.id,
            maidId: null,
            serviceId: defaultService.id,
            scheduledAt: serviceDateTime,
            timeSlot: timeSlot,
            status: 'CANCELLED',
            assignmentStatus: 'REJECTED',
            totalAmount: defaultService.basePrice,
            finalAmount: defaultService.basePrice,
            specialInstructions: `Automatic booking for ${timeSlot} time slot`,
            isAutomatic: true,
            rejectionReason: reason
          }
        });

        await queueRejectedAssignment({
          bookingId: booking.id,
          maidId: maid.id,
          rejectionReason: reason,
          customerId: customer.id
        });

        await bookingDeduplicationService.markAsProcessed(
          customer.id,
          maid.id,
          serviceDateTime,
          48 * 60 * 60
        );

        return {
          success: true,
          customerId: customer.id,
          customerName: customer.name,
          maidName: maid.user.name,
          timeSlot: timeSlot,
          serviceDateTime: serviceDateTime.toISOString(),
          bookingId: booking.id,
          queuedForReassignment: true,
          reason
        };
      }

      const bookingData = {
        customerId: customer.id,
        maidId: maid.user.id, // or maidId etc, per your model
        serviceId: defaultService.id,
        scheduledAt: serviceDateTime,
        timeSlot: timeSlot,
        status: 'PENDING',
        assignmentStatus: 'PENDING_ASSIGNMENT',
        totalAmount: defaultService.basePrice,
        finalAmount: defaultService.basePrice,
        serviceAddress: customer.address || 'Customer Address',
        estimatedDuration: defaultService.baseDuration,
        isAutomatic: true,
        specialInstructions: `Automatic booking for ${timeSlot} time slot` // <-- only if in schema
        // add any other valid Booking fields
      };

      const { booking, assignmentRequest } = await prisma.$transaction(async (tx) => {
        const booking = await tx.booking.create({ data: bookingData });
        const assignmentRequest = await tx.assignmentRequest.create({
          data: {
            bookingId: booking.id,
            maidId: maid.id,
            expiresAt: new Date(serviceDateTime.getTime() - 2 * 60 * 60 * 1000),
            status: 'pending'
          }
        });
        return { booking, assignmentRequest };
      });

      // Mark booking request as processed in Redis
      await bookingDeduplicationService.markAsProcessed(
        customer.id,
        maid.id,
        serviceDateTime,
        48 * 60 * 60 // 48 hours TTL
      );

      console.log(`✅ Created assignment request for ${customer.name} (${timeSlot})`);

      return {
        success: true,
        customerId: customer.id,
        customerName: customer.name,
        maidName: maid.user.name,
        timeSlot: timeSlot,
        serviceDateTime: serviceDateTime.toISOString(),
        bookingId: booking.id,
        assignmentRequestId: assignmentRequest.id
      };

    } catch (error) {
      console.error(`❌ Error creating assignment request for ${assignment.customer.name}:`, error);
      return {
        success: false,
        customerId: assignment.customer.id,
        customerName: assignment.customer.name,
        error: error.message
      };
    }
  }

  /**
   * Check if customer is in buffer period
   */
  static async checkCustomerBufferStatus(customerId) {
    try {
      const subscription = await prisma.subscription.findFirst({
        where: {
          status: 'ACTIVE',
          customer: {
            userId: customerId
          }
        },
        include: {
          plan: {
            select: {
              hasBufferSystem: true
            }
          }
        }
      });

      if (!subscription || !subscription.plan?.hasBufferSystem) {
        return false;
      }

      const now = new Date();

      if (subscription.isInBufferPeriod && subscription.bufferStartDate && subscription.bufferEndDate) {
        if (now >= subscription.bufferStartDate && now <= subscription.bufferEndDate) {
          return true;
        }
      }

      const activeBuffer = await prisma.bufferPeriod.findFirst({
        where: {
          subscription: {
            customer: {
              userId: customerId
            }
          },
          status: 'ACTIVE',
          startDate: { lte: now },
          endDate: { gte: now },
          OR: [
            { isAutomatic: true },
            {
              notes: {
                contains: 'STATUS: APPROVED'
              }
            }
          ]
        }
      });

      return Boolean(activeBuffer);
    } catch (error) {
      console.error('Error checking buffer status:', error);
      return false; // Don't block on buffer check errors
    }
  }

  /**
   * Get upcoming assignment requests for monitoring
   */
  static async getUpcomingRequests() {
    try {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(0, 0, 0, 0);

      const dayAfter = new Date(tomorrow);
      dayAfter.setDate(dayAfter.getDate() + 1);

      const upcomingRequests = await prisma.assignmentRequest.findMany({
        where: {
          status: 'pending',
          booking: {
            scheduledAt: {
              gte: tomorrow,
              lt: dayAfter
            },
            isAutomatic: true
          }
        },
        include: {
          booking: {
            include: {
              customer: {
                select: {
                  id: true,
                  name: true,
                  timeSlot: true
                }
              },
              service: {
                select: {
                  name: true
                }
              }
            }
          },
          maid: {
            include: {
              user: {
                select: {
                  name: true,
                  email: true
                }
              }
            }
          }
        },
        orderBy: {
          booking: {
            scheduledAt: 'asc'
          }
        }
      });

      return upcomingRequests;
    } catch (error) {
      console.error('Error getting upcoming requests:', error);
      return [];
    }
  }

  /**
   * Manual trigger for testing
   */
  static async triggerManualProcessing() {
    console.log('🔧 Manual trigger for automatic assignment processing');
    return await this.processAutomaticRequests();
  }

  /**
   * Get statistics about automatic requests
   */
  static async getStatistics() {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const [
        totalActiveAssignments,
        todayRequests,
        tomorrowRequests,
        pendingRequests
      ] = await Promise.all([
        prisma.customerMaidAssignment.count({
          where: { isActive: true }
        }),
        prisma.assignmentRequest.count({
          where: {
            createdAt: {
              gte: today,
              lt: tomorrow
            }
          }
        }),
        prisma.assignmentRequest.count({
          where: {
            booking: {
              scheduledAt: {
                gte: tomorrow,
                lt: new Date(tomorrow.getTime() + 24 * 60 * 60 * 1000)
              }
            }
          }
        }),
        prisma.assignmentRequest.count({
          where: {
            status: 'pending'
          }
        })
      ]);

      return {
        totalActiveAssignments,
        todayRequests,
        tomorrowRequests,
        pendingRequests
      };
    } catch (error) {
      console.error('Error getting statistics:', error);
      return {
        totalActiveAssignments: 0,
        todayRequests: 0,
        tomorrowRequests: 0,
        pendingRequests: 0
      };
    }
  }

  /**
   * Process all customers on server startup to catch any missed requests
   * This ensures requests are sent even if server was down during scheduled time
   */
  static async processOnServerStartup() {
    try {
      console.log('🚀 SERVER STARTUP: Checking for missed assignment requests...');
      
      const result = await this.processAutomaticRequests();
      
      if (result.created > 0) {
        console.log(`🚨 SERVER STARTUP: Sent ${result.created} missed assignment requests`);
      } else {
        console.log('✅ SERVER STARTUP: No missed requests found');
      }
      
      return result;
    } catch (error) {
      console.error('❌ SERVER STARTUP: Error processing missed requests:', error);
      return {
        success: false,
        created: 0,
        errors: 1,
        results: [],
        errorDetails: [{ error: error.message }]
      };
    }
  }
}

module.exports = AutomaticAssignmentService;

// Add cron trigger if none exists for processAutomaticRequests
if (require.main === module) {
  // On startup, run immediately once
  AutomaticAssignmentService.processAutomaticRequests();
  // Schedule to run every 15 minutes for more responsive assignment requests
  cron.schedule('*/15 * * * *', () => {
    console.log('⏰ [CRON] Running automatic assignment requests processing...');
    AutomaticAssignmentService.processAutomaticRequests();
  });
}
