const { PrismaClient } = require('@prisma/client');
const {
  scheduleAssignmentRequest,
  scheduleAllAssignments,
  scheduleRepeatingAssignmentCheck,
  scheduleExpiredRequestHandler
} = require('../queues/assignmentQueue');
const {
  calculateRequestTime,
  getNextServiceDateTime,
  ASSIGNMENT_REQUEST_HOURS_BEFORE
} = require('../utils/timeSlotUtils');

const prisma = new PrismaClient();

/**
 * Job Scheduling Service
 * Manages scheduling of assignment requests through BullMQ
 */
class JobScheduler {
  
  /**
   * Initialize the job scheduler
   * This is called when the server starts
   */
  static async initialize() {
    try {
      console.log('🚀 Initializing Job Scheduler...');

      // Schedule repeating job to check for assignments every hour
      await scheduleRepeatingAssignmentCheck('0 * * * *'); // Every hour
      console.log('✅ Scheduled repeating assignment check (hourly)');

      // Schedule expired request handler
      await scheduleExpiredRequestHandler();
      console.log('✅ Scheduled expired request handler');

      // On startup, schedule jobs for all active assignments
      await this.scheduleAllActiveAssignments();
      console.log('✅ Scheduled jobs for all active assignments');

      // On startup, also trigger immediate processing so customers within the <=20h window
      // don't wait until the next hourly recurring run.
      await scheduleAllAssignments();
      console.log('✅ Triggered immediate processing of assignments on startup');

      console.log('🎉 Job Scheduler initialized successfully');
    } catch (error) {
      console.error('❌ Failed to initialize Job Scheduler:', error);
      throw error;
    }
  }

  /**
   * Schedule jobs for all active customer-maid assignments
   * This is called on server startup and can be manually triggered
   */
  static async scheduleAllActiveAssignments() {
    try {
      console.log('📋 Scheduling jobs for all active assignments...');

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
              timeSlot: true,
              address: true
            }
          },
          maid: {
            include: {
              user: {
                select: {
                  id: true,
                  name: true
                }
              }
            }
          }
        }
      });

      console.log(`👥 Found ${activeAssignments.length} active assignments`);

      const scheduledJobs = [];
      const errors = [];

      for (const assignment of activeAssignments) {
        try {
          const result = await this.scheduleForCustomer(
            assignment.customerId,
            assignment.maidId,
            assignment.customer.timeSlot,
            {
              customerName: assignment.customer.name,
              maidName: assignment.maid.user.name,
              maidUserId: assignment.maid.user.id
            }
          );

          if (result.success) {
            scheduledJobs.push(result);
          } else {
            errors.push(result);
          }
        } catch (error) {
          console.error(`❌ Error scheduling for ${assignment.customer.name}:`, error);
          errors.push({
            customerId: assignment.customerId,
            error: error.message
          });
        }
      }

      console.log(`✅ Scheduling complete:`);
      console.log(`   Scheduled: ${scheduledJobs.length}`);
      console.log(`   Skipped/Errors: ${errors.length}`);

      return {
        success: true,
        scheduled: scheduledJobs.length,
        errors: errors.length,
        scheduledJobs,
        errorDetails: errors
      };
    } catch (error) {
      console.error('❌ Failed to schedule all assignments:', error);
      throw error;
    }
  }

  /**
   * Schedule assignment request for a specific customer
   * @param {string} customerId - Customer user ID
   * @param {string} maidId - Maid profile ID
   * @param {string} timeSlot - Customer's time slot
   * @param {Object} metadata - Additional data
   */
  static async scheduleForCustomer(customerId, maidId, timeSlot, metadata = {}) {
    try {
      // Check if customer is in buffer period
      const isInBuffer = await this.checkCustomerBufferStatus(customerId);
      if (isInBuffer) {
        console.log(`⏸️ Skipping ${metadata.customerName || customerId} - in buffer period`);
        return {
          success: false,
          customerId,
          reason: 'Customer in buffer period'
        };
      }

      // Calculate when to send the assignment request
      const serviceDateTime = getNextServiceDateTime(timeSlot);
      const requestTime = calculateRequestTime(serviceDateTime, timeSlot);
      const now = new Date();

      // Check if we should schedule or execute immediately
      const delay = requestTime.getTime() - now.getTime();
      const hoursUntilService = (serviceDateTime.getTime() - now.getTime()) / (1000 * 60 * 60);

      // If within 20 hours of service time, it will be handled by PROCESS_ALL_ASSIGNMENTS job
      if (hoursUntilService <= ASSIGNMENT_REQUEST_HOURS_BEFORE && hoursUntilService > 0) {
        console.log(`⚡ ${metadata.customerName || customerId} will be handled by recurring job (${hoursUntilService.toFixed(2)}h until service)`);
        return {
          success: true,
          customerId,
          scheduledTime: requestTime.toISOString(),
          serviceTime: serviceDateTime.toISOString(),
          handledBy: 'recurring-job'
        };
      }

      // Check if already exists for this service time
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
        console.log(`📋 Assignment already exists for ${metadata.customerName || customerId}`);
        return {
          success: false,
          customerId,
          reason: 'Assignment request already exists'
        };
      }

      // Schedule the job
      const jobData = {
        customerId,
        maidId,
        timeSlot,
        customerName: metadata.customerName,
        maidName: metadata.maidName,
        maidUserId: metadata.maidUserId
      };

      const job = await scheduleAssignmentRequest(jobData, requestTime);

      if (job?.skipped) {
        console.warn(`⚠️ Assignment job not enqueued for ${metadata.customerName || customerId}: ${job.reason}`);
        return {
          success: false,
          customerId,
          reason: job.reason || 'Validation failed',
          skipped: true
        };
      }

      if (!job?.id) {
        return {
          success: false,
          customerId,
          reason: 'Failed to schedule assignment job'
        };
      }

      console.log(`✅ Scheduled assignment for ${metadata.customerName || customerId}`);
      console.log(`   Job ID: ${job.id}`);
      console.log(`   Service Time: ${serviceDateTime.toISOString()}`);
      console.log(`   Request Time: ${requestTime.toISOString()}`);
      console.log(`   Delay: ${(delay / 1000 / 60 / 60).toFixed(2)} hours`);

      return {
        success: true,
        customerId,
        jobId: job.id,
        scheduledTime: requestTime.toISOString(),
        serviceTime: serviceDateTime.toISOString(),
        delay: delay
      };
    } catch (error) {
      console.error(`❌ Failed to schedule for customer ${customerId}:`, error);
      throw error;
    }
  }

  /**
   * Manually trigger processing of all assignments (for testing/admin)
   */
  static async triggerManualProcessing() {
    try {
      console.log('🔧 Manual trigger: Processing all assignments');
      const job = await scheduleAllAssignments();
      return {
        success: true,
        jobId: job.id,
        message: 'Manual processing job queued'
      };
    } catch (error) {
      console.error('❌ Manual trigger failed:', error);
      throw error;
    }
  }

  /**
   * Schedule assignment when a new customer-maid assignment is created
   * Called when admin assigns a maid to a customer
   */
  static async onNewAssignment(customerId, maidId, timeSlot) {
    try {
      console.log(`🆕 New assignment detected: Customer ${customerId}, Maid ${maidId}`);

      // Get customer and maid details
      const customer = await prisma.user.findUnique({
        where: { id: customerId },
        select: { name: true, timeSlot: true }
      });

      const maid = await prisma.maidProfile.findUnique({
        where: { id: maidId },
        include: {
          user: {
            select: { id: true, name: true }
          }
        }
      });

      if (!customer || !maid) {
        throw new Error('Customer or Maid not found');
      }

      const result = await this.scheduleForCustomer(
        customerId,
        maidId,
        timeSlot || customer.timeSlot,
        {
          customerName: customer.name,
          maidName: maid.user.name,
          maidUserId: maid.user.id
        }
      );

      console.log(`✅ Scheduled assignment for new customer-maid pair`);
      return result;
    } catch (error) {
      console.error('❌ Failed to schedule new assignment:', error);
      throw error;
    }
  }

  /**
   * Cancel scheduled jobs for a customer (when assignment is deactivated)
   */
  static async cancelScheduledJobs(customerId, timeSlot) {
    try {
      console.log(`🗑️ Canceling scheduled jobs for customer ${customerId}`);
      
      // This would require tracking job IDs by customer
      // For now, jobs will naturally not create requests if assignment is inactive
      
      console.log(`✅ Scheduled jobs for customer ${customerId} will be skipped`);
      return {
        success: true,
        message: 'Jobs will be skipped due to inactive assignment'
      };
    } catch (error) {
      console.error('❌ Failed to cancel jobs:', error);
      throw error;
    }
  }

  /**
   * Check if customer is in buffer period
   */
  static async checkCustomerBufferStatus(customerId) {
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

      return !!activeBuffer;
    } catch (error) {
      console.error('Error checking buffer status:', error);
      return false;
    }
  }
}

module.exports = JobScheduler;
