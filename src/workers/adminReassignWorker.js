const { Worker } = require('bullmq');
const { PrismaClient } = require('@prisma/client');
const { createRedisConnection } = require('../config/redis');
const { REASSIGNMENT_JOB_TYPES } = require('../queues/adminReassignQueue');

/**
 * Admin Reassignment Worker
 * 
 * This worker processes admin reassignment jobs when maids reject assignments.
 * It handles finding alternative maids and updating booking statuses idempotently.
 */

// Initialize Prisma
const prisma = new PrismaClient();

// Create Redis connection for worker
const connection = createRedisConnection();

// Job processor function
const processReassignmentJob = async (job) => {
  console.log(`\n🔄 Processing reassignment job: ${job.name} (ID: ${job.id})`);
  console.log(`📦 Job data:`, JSON.stringify(job.data, null, 2));

  try {
    switch (job.name) {
      case REASSIGNMENT_JOB_TYPES.PROCESS_REJECTED_ASSIGNMENT:
        return await processRejectedAssignment(job.data);
      
      case REASSIGNMENT_JOB_TYPES.FIND_ALTERNATIVE_MAID:
        return await findAlternativeMaid(job.data);
      
      case REASSIGNMENT_JOB_TYPES.NOTIFY_ADMIN_REASSIGNMENT:
        return await notifyAdminReassignment(job.data);
      
      case REASSIGNMENT_JOB_TYPES.UPDATE_BOOKING_STATUS:
        return await updateBookingStatus(job.data);
      
      default:
        throw new Error(`Unknown reassignment job type: ${job.name}`);
    }
  } catch (error) {
    console.error(`❌ Reassignment job ${job.id} failed:`, error);
    throw error; // Re-throw to mark job as failed
  }
};

/**
 * Process a rejected assignment
 */
const processRejectedAssignment = async (data) => {
  const { bookingId, maidId, rejectionReason, customerId } = data;
  
  console.log(`🔄 Processing rejected assignment for booking ${bookingId}`);
  
  try {
    // Get booking details
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        customer: true,
        service: true,
        assignmentRequests: {
          where: { status: 'rejected' },
          include: { maid: { include: { user: true } } }
        }
      }
    });

    if (!booking) {
      throw new Error(`Booking ${bookingId} not found`);
    }

    // Update assignment request status to rejected
    await prisma.assignmentRequest.updateMany({
      where: {
        bookingId: bookingId,
        maidId: maidId,
        status: 'pending'
      },
      data: {
        status: 'rejected',
        rejectionReason: rejectionReason,
        respondedAt: new Date()
      }
    });

    // Update booking status for reassignment
    await prisma.booking.update({
      where: { id: bookingId },
      data: {
        assignmentStatus: 'REJECTED',
        rejectionReason: rejectionReason,
        reassignmentCount: { increment: 1 },
        updatedAt: new Date()
      }
    });

    if (rejectionReason === 'Maid unavailable') {
      await notifyAdminReassignment({
        bookingId,
        customerId,
        maidId,
        reason: rejectionReason
      });
    } else {
      const rejectedMaidIds = booking.assignmentRequests
        .map(req => req.maidId)
        .concat(maidId);
      await findAlternativeMaid({
        bookingId,
        excludedMaidIds: rejectedMaidIds,
        customerId
      });
      await notifyAdminReassignment({
        bookingId,
        customerId,
        maidId,
        reason: rejectionReason
      });
    }

    console.log(`✅ Processed rejected assignment for booking ${bookingId}`);
    
    return {
      success: true,
      bookingId,
      rejectedMaidId: maidId,
      rejectionReason,
      reassignmentCount: booking.reassignmentCount + 1
    };

  } catch (error) {
    console.error(`❌ Failed to process rejected assignment for booking ${bookingId}:`, error);
    throw error;
  }
};

/**
 * Find alternative maid for a booking
 */
const findAlternativeMaid = async (data) => {
  const { bookingId, excludedMaidIds = [], customerId } = data;
  
  console.log(`🔍 Finding alternative maid for booking ${bookingId}`);
  
  try {
    // Get booking details
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        customer: true,
        service: true,
        zone: true
      }
    });

    if (!booking) {
      throw new Error(`Booking ${bookingId} not found`);
    }

    // Find available maids in the same zone
    const availableMaids = await prisma.maidProfile.findMany({
      where: {
        id: { notIn: excludedMaidIds },
        status: 'ACTIVE',
        isFloatingMaid: false,
        zones: booking.zoneId ? {
          some: {
            zoneId: booking.zoneId
          }
        } : undefined
      },
      include: {
        user: true,
        zones: {
          include: { zone: true }
        }
      },
      take: 5 // Limit to top 5 candidates
    });
    const filteredMaids = availableMaids.filter(m => (m.availability && m.availability.isAvailable === false) ? false : true);

    if (filteredMaids.length === 0) {
      console.log(`⚠️ No available maids found for booking ${bookingId}`);
      
      // Update booking status to require manual assignment
      await prisma.booking.update({
        where: { id: bookingId },
        data: {
          assignmentStatus: 'MANUAL_ASSIGNMENT_REQUIRED',
          rejectionReason: 'No available maids found for automatic reassignment'
        }
      });

      return {
        success: false,
        bookingId,
        reason: 'No available maids found',
        requiresManualAssignment: true
      };
    }

    // Select the best maid (highest rating, most completed bookings)
    const selectedMaid = filteredMaids.reduce((best, current) => {
      if (current.rating > best.rating) return current;
      if (current.rating === best.rating && current.completedBookings > best.completedBookings) {
        return current;
      }
      return best;
    });

    console.log(`✅ Found alternative maid: ${selectedMaid.user.name} (${selectedMaid.id})`);

    // Create new assignment request
    const assignmentRequest = await prisma.assignmentRequest.create({
      data: {
        bookingId: bookingId,
        maidId: selectedMaid.id,
        status: 'pending',
        expiresAt: new Date(Date.now() + (2 * 60 * 60 * 1000)) // 2 hours expiry
      }
    });

    // Update booking status
    await prisma.booking.update({
      where: { id: bookingId },
      data: {
        assignmentStatus: 'PENDING_ASSIGNMENT',
        rejectionReason: null // Clear previous rejection reason
      }
    });

    return {
      success: true,
      bookingId,
      selectedMaidId: selectedMaid.id,
      selectedMaidName: selectedMaid.user.name,
      assignmentRequestId: assignmentRequest.id,
      expiresAt: assignmentRequest.expiresAt
    };

  } catch (error) {
    console.error(`❌ Failed to find alternative maid for booking ${bookingId}:`, error);
    throw error;
  }
};

/**
 * Notify admin about reassignment
 */
const notifyAdminReassignment = async (data) => {
  const { bookingId, customerId, maidId, reason } = data;
  
  console.log(`📢 Notifying admin about reassignment for booking ${bookingId}`);
  
  try {
    // Get admin users
    const admins = await prisma.user.findMany({
      where: { role: 'ADMIN' },
      select: { id: true, name: true, email: true }
    });

    // Get booking and maid details
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        customer: true,
        service: true
      }
    });

    const maid = await prisma.maidProfile.findUnique({
      where: { id: maidId },
      include: { user: true }
    });

    if (!booking || !maid) {
      throw new Error('Booking or maid not found');
    }

    // Create notifications for all admins
    const notifications = admins.map(admin => ({
      userId: admin.id,
      type: 'REASSIGNMENT_REQUIRED',
      title: 'Maid Assignment Rejected',
      message: `Maid ${maid.user.name} rejected assignment for ${booking.customer.name}. Reason: ${reason}`,
      data: {
        bookingId,
        customerId,
        maidId,
        reason,
        customerName: booking.customer.name,
        maidName: maid.user.name,
        serviceName: booking.service.name,
        scheduledAt: booking.scheduledAt
      },
      createdAt: new Date()
    }));

    await prisma.notification.createMany({
      data: notifications
    });

    console.log(`✅ Notified ${admins.length} admins about reassignment`);

    return {
      success: true,
      bookingId,
      notifiedAdmins: admins.length,
      notificationCount: notifications.length
    };

  } catch (error) {
    console.error(`❌ Failed to notify admin about reassignment for booking ${bookingId}:`, error);
    throw error;
  }
};

/**
 * Update booking status
 */
const updateBookingStatus = async (data) => {
  const { bookingId, status, assignmentStatus, reason } = data;
  
  console.log(`📝 Updating booking status for booking ${bookingId}`);
  
  try {
    // Get current booking status for idempotent update
    const currentBooking = await prisma.booking.findUnique({
      where: { id: bookingId },
      select: { status: true, assignmentStatus: true }
    });

    if (!currentBooking) {
      throw new Error(`Booking ${bookingId} not found`);
    }

    // Only update if status has changed (idempotent)
    const updateData = {};
    
    if (status && status !== currentBooking.status) {
      updateData.status = status;
    }
    
    if (assignmentStatus && assignmentStatus !== currentBooking.assignmentStatus) {
      updateData.assignmentStatus = assignmentStatus;
    }
    
    if (reason) {
      updateData.rejectionReason = reason;
    }

    if (Object.keys(updateData).length === 0) {
      console.log(`ℹ️ No status changes needed for booking ${bookingId}`);
      return {
        success: true,
        bookingId,
        message: 'No changes needed',
        currentStatus: currentBooking.status,
        currentAssignmentStatus: currentBooking.assignmentStatus
      };
    }

    updateData.updatedAt = new Date();

    const updatedBooking = await prisma.booking.update({
      where: { id: bookingId },
      data: updateData
    });

    console.log(`✅ Updated booking status for booking ${bookingId}`);
    console.log(`   Status: ${currentBooking.status} → ${updatedBooking.status}`);
    console.log(`   Assignment Status: ${currentBooking.assignmentStatus} → ${updatedBooking.assignmentStatus}`);

    return {
      success: true,
      bookingId,
      previousStatus: currentBooking.status,
      newStatus: updatedBooking.status,
      previousAssignmentStatus: currentBooking.assignmentStatus,
      newAssignmentStatus: updatedBooking.assignmentStatus,
      reason
    };

  } catch (error) {
    console.error(`❌ Failed to update booking status for booking ${bookingId}:`, error);
    throw error;
  }
};

// Create the worker with enhanced reliability settings
const worker = new Worker('admin-reassignment', processReassignmentJob, {
  connection,
  concurrency: parseInt(process.env.REASSIGNMENT_WORKER_CONCURRENCY) || 3, // Process up to 3 jobs concurrently
  limiter: {
    max: parseInt(process.env.REASSIGNMENT_WORKER_RATE_LIMIT) || 5, // Max 5 jobs
    duration: 1000, // per 1 second
  },
  // Enhanced reliability settings
  settings: {
    stalledInterval: 30 * 1000, // Check for stalled jobs every 30 seconds
    maxStalledCount: 1, // Max times a job can be stalled before failing
  },
  // Job processing options
  skipLockRenewal: false, // Keep renewing locks for long-running jobs
  skipDelayedJobs: false, // Process delayed jobs
});

// Worker event listeners
worker.on('ready', () => {
  console.log('✅ Admin Reassignment Worker is ready and waiting for jobs');
});

worker.on('active', (job) => {
  console.log(`🔄 Worker processing reassignment job ${job.id}: ${job.name}`);
});

worker.on('completed', (job, result) => {
  console.log(`✅ Reassignment job ${job.id} completed successfully`);
  console.log(`   Result:`, JSON.stringify(result, null, 2));
});

worker.on('failed', (job, err) => {
  console.error(`❌ Reassignment job ${job?.id} failed:`, err.message);
  console.error(`   Attempts: ${job?.attemptsMade}/${job?.opts.attempts}`);
});

worker.on('error', (err) => {
  console.error('❌ Admin Reassignment Worker error:', err);
});

worker.on('stalled', (jobId) => {
  console.warn(`⚠️ Reassignment job ${jobId} stalled`);
});

// Graceful shutdown
const shutdown = async () => {
  console.log('\n🛑 Shutting down admin reassignment worker...');
  await worker.close();
  await prisma.$disconnect();
  console.log('✅ Admin reassignment worker shut down gracefully');
  process.exit(0);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

console.log(`
╔════════════════════════════════════════════════════════════════╗
║                                                                ║
║   🚀 SWEEPRO ADMIN REASSIGNMENT WORKER                      ║
║                                                                ║
║   Status: Running 24/7                                        ║
║   Queue: admin-reassignment                                   ║
║   Concurrency: 3 jobs                                         ║
║   Rate Limit: 5 jobs/second                                   ║
║                                                                ║
║   This worker processes maid reassignment jobs when maids     ║
║   reject assignments and handles finding alternative maids.   ║
║                                                                ║
╚════════════════════════════════════════════════════════════════╝
`);

module.exports = worker;


