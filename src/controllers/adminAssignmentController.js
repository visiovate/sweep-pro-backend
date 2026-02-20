const { getPrismaClient } = require('../utils/database');
const { PrismaClient } = require('@prisma/client');
const JobScheduler = require('../services/jobScheduler');
const { formatInIST } = require('../utils/timeSlotUtils');
const { runDailyBookingAutomation } = require('../scripts/daily-booking-automation');

const prisma = getPrismaClient();

/**
 * Admin Assignment Controller
 * 
 * Handles admin operations for customer-maid assignments and job scheduling
 */

/**
 * Get all active customer-maid assignments
 */
const getActiveAssignments = async (req, res) => {
  try {
    console.log('\n📋 Admin: Fetching active assignments...');

    const assignments = await prisma.customerMaidAssignment.findMany({
      where: { isActive: true },
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            address: true,
            timeSlot: true
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
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    console.log(`✅ Found ${assignments.length} active assignments`);

    // Transform data for admin panel
    const transformedAssignments = assignments.map(assignment => ({
      id: assignment.id,
      customerId: assignment.customerId,
      maidId: assignment.maidId,
      isActive: assignment.isActive,
      assignedAt: assignment.assignedAt,
      assignedAtIST: formatInIST(assignment.assignedAt),
      notes: assignment.notes,
      createdAt: assignment.createdAt,
      createdAtIST: formatInIST(assignment.createdAt),
      customer: {
        id: assignment.customer.id,
        name: assignment.customer.name,
        email: assignment.customer.email,
        phone: assignment.customer.phone,
        address: assignment.customer.address,
        timeSlot: assignment.customer.timeSlot
      },
      maid: {
        profileId: assignment.maid.id,
        userId: assignment.maid.user.id,
        name: assignment.maid.user.name,
        email: assignment.maid.user.email,
        phone: assignment.maid.user.phone,
        status: assignment.maid.status,
        rating: assignment.maid.rating,
        completedBookings: assignment.maid.completedBookings
      }
    }));

    res.json({
      success: true,
      count: transformedAssignments.length,
      data: transformedAssignments
    });

  } catch (error) {
    console.error('❌ Error fetching active assignments:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch active assignments',
      error: error.message
    });
  }
};

/**
 * Manually trigger job scheduling for all active assignments
 */
const triggerJobScheduling = async (req, res) => {
  try {
    console.log('\n🚀 Admin: Manually triggering job scheduling...');

    const result = await JobScheduler.scheduleAllActiveAssignments();

    console.log(`✅ Job scheduling completed`);
    console.log(`   Scheduled: ${result.scheduled}`);
    console.log(`   Errors: ${result.errors}`);

    res.json({
      success: true,
      message: 'Job scheduling triggered successfully',
      data: {
        scheduled: result.scheduled,
        errors: result.errors,
        scheduledJobs: result.scheduledJobs,
        errorDetails: result.errorDetails
      }
    });

  } catch (error) {
    console.error('❌ Error triggering job scheduling:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to trigger job scheduling',
      error: error.message
    });
  }
};

/**
 * Get assignment status and next scheduled requests
 */
const getAssignmentStatus = async (req, res) => {
  try {
    console.log('\n📊 Admin: Getting assignment status overview...');

    // Get active assignments count
    const activeAssignments = await prisma.customerMaidAssignment.count({
      where: { isActive: true }
    });

    // Get pending assignment requests
    const pendingRequests = await prisma.assignmentRequest.findMany({
      where: {
        status: 'pending',
        expiresAt: { gt: new Date() }
      },
      include: {
        booking: {
          include: {
            customer: { select: { name: true } },
            service: { select: { name: true } }
          }
        },
        maid: {
          include: {
            user: { select: { name: true } }
          }
        }
      },
      orderBy: { requestedAt: 'desc' }
    });

    // Get recent assignment history
    const recentRequests = await prisma.assignmentRequest.findMany({
      include: {
        booking: {
          include: {
            customer: { select: { name: true } },
            service: { select: { name: true } }
          }
        },
        maid: {
          include: {
            user: { select: { name: true } }
          }
        }
      },
      orderBy: { requestedAt: 'desc' },
      take: 20
    });

    // Get pending bookings
    const pendingBookings = await prisma.booking.findMany({
      where: {
        assignmentStatus: 'PENDING_ASSIGNMENT',
        status: { in: ['PENDING', 'CONFIRMED'] }
      },
      include: {
        customer: { select: { name: true } },
        service: { select: { name: true } }
      },
      orderBy: { scheduledAt: 'asc' }
    });

    const statusOverview = {
      activeAssignments,
      pendingRequests: pendingRequests.length,
      recentRequestsTotal: recentRequests.length,
      pendingBookings: pendingBookings.length,
      pendingRequestDetails: pendingRequests.map(req => ({
        id: req.id,
        customer: req.booking.customer.name,
        maid: req.maid.user.name,
        service: req.booking.service.name,
        requestedAt: req.requestedAt,
        requestedAtIST: formatInIST(req.requestedAt),
        expiresAt: req.expiresAt,
        expiresAtIST: formatInIST(req.expiresAt)
      })),
      recentRequestsDetails: recentRequests.slice(0, 10).map(req => ({
        id: req.id,
        customer: req.booking.customer.name,
        maid: req.maid.user.name,
        service: req.booking.service.name,
        status: req.status,
        requestedAt: req.requestedAt,
        requestedAtIST: formatInIST(req.requestedAt),
        respondedAt: req.respondedAt,
        respondedAtIST: req.respondedAt ? formatInIST(req.respondedAt) : null,
        rejectionReason: req.rejectionReason
      })),
      pendingBookingsDetails: pendingBookings.slice(0, 10).map(booking => ({
        id: booking.id,
        customer: booking.customer.name,
        service: booking.service.name,
        scheduledAt: booking.scheduledAt,
        scheduledAtIST: formatInIST(booking.scheduledAt),
        status: booking.status,
        assignmentStatus: booking.assignmentStatus
      }))
    };

    console.log(`📈 Status Overview:`);
    console.log(`   Active Assignments: ${activeAssignments}`);
    console.log(`   Pending Requests: ${pendingRequests.length}`);
    console.log(`   Pending Bookings: ${pendingBookings.length}`);

    res.json({
      success: true,
      data: statusOverview
    });

  } catch (error) {
    console.error('❌ Error getting assignment status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get assignment status',
      error: error.message
    });
  }
};

/**
 * Create a new customer-maid assignment
 */
const createAssignment = async (req, res) => {
  try {
    const { customerId, maidId, notes } = req.body;

    console.log(`\n🤝 Admin: Creating new assignment`);
    console.log(`   Customer ID: ${customerId}`);
    console.log(`   Maid ID: ${maidId}`);

    // Validate customer exists and has time slot
    const customer = await prisma.user.findUnique({
      where: { id: customerId, role: 'CUSTOMER' },
      select: { id: true, name: true, timeSlot: true }
    });

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: 'Customer not found'
      });
    }

    if (!customer.timeSlot) {
      return res.status(400).json({
        success: false,
        message: 'Customer does not have a time slot set'
      });
    }

    // Validate maid profile exists
    const maidProfile = await prisma.maidProfile.findUnique({
      where: { id: maidId, status: 'ACTIVE' },
      include: {
        user: { select: { name: true } }
      }
    });

    if (!maidProfile) {
      return res.status(404).json({
        success: false,
        message: 'Active maid profile not found'
      });
    }

    // Check if customer already has an active assignment
    const existingAssignment = await prisma.customerMaidAssignment.findFirst({
      where: { customerId, isActive: true }
    });

    if (existingAssignment) {
      return res.status(400).json({
        success: false,
        message: 'Customer already has an active assignment'
      });
    }

    // Create the assignment
    const assignment = await prisma.customerMaidAssignment.create({
      data: {
        customerId,
        maidId,
        isActive: true,
        notes: notes || `Admin assigned ${customer.name} to ${maidProfile.user.name}`,
        assignedAt: new Date()
      },
      include: {
        customer: {
          select: { name: true, timeSlot: true }
        },
        maid: {
          include: {
            user: { select: { name: true } }
          }
        }
      }
    });

    console.log(`✅ Assignment created: ${assignment.customer.name} → ${assignment.maid.user.name}`);

    // Trigger scheduling for this new assignment
    try {
      await JobScheduler.onNewAssignment(customerId, maidId, customer.timeSlot);
      console.log(`✅ Job scheduling triggered for new assignment`);
    } catch (scheduleError) {
      console.error(`⚠️  Failed to schedule job for new assignment:`, scheduleError.message);
    }

    res.json({
      success: true,
      message: 'Assignment created successfully',
      data: {
        id: assignment.id,
        customer: assignment.customer.name,
        maid: assignment.maid.user.name,
        timeSlot: assignment.customer.timeSlot,
        assignedAt: assignment.assignedAt,
        assignedAtIST: formatInIST(assignment.assignedAt)
      }
    });

  } catch (error) {
    console.error('❌ Error creating assignment:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create assignment',
      error: error.message
    });
  }
};

/**
 * Deactivate an assignment
 */
const deactivateAssignment = async (req, res) => {
  try {
    const { assignmentId } = req.params;

    console.log(`\n⚠️  Admin: Deactivating assignment ${assignmentId}`);

    const assignment = await prisma.customerMaidAssignment.update({
      where: { id: assignmentId },
      data: { isActive: false },
      include: {
        customer: { select: { name: true } },
        maid: { include: { user: { select: { name: true } } } }
      }
    });

    console.log(`✅ Assignment deactivated: ${assignment.customer.name} → ${assignment.maid.user.name}`);

    res.json({
      success: true,
      message: 'Assignment deactivated successfully',
      data: {
        id: assignment.id,
        customer: assignment.customer.name,
        maid: assignment.maid.user.name
      }
    });

  } catch (error) {
    console.error('❌ Error deactivating assignment:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to deactivate assignment',
      error: error.message
    });
  }
};

/**
 * Run daily booking automation manually
 */
const runDailyAutomation = async (req, res) => {
  try {
    console.log('\n🤖 Admin: Manually running daily booking automation...');

    const result = await runDailyBookingAutomation();

    console.log(`✅ Daily automation completed`);
    console.log(`   Created: ${result.created}`);
    console.log(`   Skipped: ${result.skipped}`);
    console.log(`   Errors: ${result.errors}`);

    res.json({
      success: true,
      message: 'Daily booking automation completed successfully',
      data: {
        created: result.created,
        skipped: result.skipped,
        errors: result.errors,
        results: result.results,
        skippedDetails: result.skippedDetails,
        errorDetails: result.errorDetails
      }
    });

  } catch (error) {
    console.error('❌ Error running daily automation:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to run daily automation',
      error: error.message
    });
  }
};

module.exports = {
  getActiveAssignments,
  triggerJobScheduling,
  getAssignmentStatus,
  createAssignment,
  deactivateAssignment,
  runDailyAutomation
};
