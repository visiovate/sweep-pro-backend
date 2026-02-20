const { getPrismaClient } = require('../utils/database');
const { PrismaClient } = require('@prisma/client');
const { queueRejectedAssignment } = require('../queues/adminReassignQueue');
const { formatInIST } = require('../utils/timeSlotUtils');

const prisma = getPrismaClient();

/**
 * Booking Request Controller
 * 
 * Handles maid responses to automatic booking requests
 * - Accept booking requests
 * - Reject booking requests (with reason)
 * - View pending requests
 */

/**
 * Get all pending booking requests for the logged-in maid
 */
const getPendingRequests = async (req, res) => {
  try {
    console.log(`\n📋 Fetching pending requests for maid: ${req.user.name} (${req.user.id})`);

    // Find the maid profile for this user
    const maidProfile = await prisma.maidProfile.findUnique({
      where: { userId: req.user.id }
    });
    
    if (!maidProfile) {
      console.log(`❌ Maid profile not found for user: ${req.user.id}`);
      return res.status(400).json({
        success: false,
        message: 'Maid profile not found'
      });
    }
    
    console.log(`✅ Found maid profile: ${maidProfile.id}`);

    // Get all pending assignment requests
    const requests = await prisma.assignmentRequest.findMany({
      where: {
        maidId: maidProfile.id,
        status: 'pending',
        expiresAt: {
          gt: new Date() // Only get non-expired requests
        }
      },
      include: {
        booking: {
          include: {
            service: true,
            customer: {
              select: {
                id: true,
                name: true,
                email: true,
                phone: true,
                address: true
              }
            }
          }
        }
      },
      orderBy: {
        requestedAt: 'desc'
      }
    });

    console.log(`📊 Found ${requests.length} pending requests`);

    // Transform data for frontend
    const transformedRequests = requests.map(request => ({
      id: request.id,
      bookingId: request.bookingId,
      requestedAt: request.requestedAt,
      expiresAt: request.expiresAt,
      expiresAtIST: formatInIST(request.expiresAt),
      booking: {
        id: request.booking.id,
        scheduledAt: request.booking.scheduledAt,
        scheduledAtIST: formatInIST(request.booking.scheduledAt),
        timeSlot: request.booking.timeSlot,
        serviceAddress: request.booking.serviceAddress,
        totalAmount: request.booking.totalAmount,
        specialInstructions: request.booking.specialInstructions,
        service: {
          id: request.booking.service.id,
          name: request.booking.service.name,
          description: request.booking.service.description,
          category: request.booking.service.category,
          baseDuration: request.booking.service.baseDuration
        },
        customer: {
          id: request.booking.customer.id,
          name: request.booking.customer.name,
          email: request.booking.customer.email,
          phone: request.booking.customer.phone,
          address: request.booking.customer.address
        }
      }
    }));

    res.json({
      success: true,
      count: transformedRequests.length,
      data: transformedRequests
    });

  } catch (error) {
    console.error('❌ Error fetching pending requests:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch pending requests',
      error: error.message
    });
  }
};

/**
 * Accept a booking request
 */
const acceptRequest = async (req, res) => {
  try {
    const { requestId } = req.params;
    
    console.log(`\n✅ Processing ACCEPT request`);
    console.log(`   Request ID: ${requestId}`);
    console.log(`   Maid: ${req.user.name} (${req.user.id})`);

    // Find the maid profile
    const maidProfile = await prisma.maidProfile.findUnique({
      where: { userId: req.user.id }
    });
    
    if (!maidProfile) {
      console.log(`❌ Maid profile not found`);
      return res.status(400).json({
        success: false,
        message: 'Maid profile not found'
      });
    }

    // Find the assignment request
    const request = await prisma.assignmentRequest.findFirst({
      where: {
        id: requestId,
        maidId: maidProfile.id,
        status: 'pending'
      },
      include: {
        booking: {
          include: {
            customer: true,
            service: true
          }
        }
      }
    });

    if (!request) {
      console.log(`❌ Request not found or already processed`);
      return res.status(404).json({
        success: false,
        message: 'Request not found or already processed'
      });
    }

    // Check if request has expired
    if (new Date() > request.expiresAt) {
      console.log(`❌ Request has expired`);
      return res.status(400).json({
        success: false,
        message: 'This request has expired'
      });
    }

    console.log(`📋 Request details:`);
    console.log(`   Booking ID: ${request.bookingId}`);
    console.log(`   Customer: ${request.booking.customer.name}`);
    console.log(`   Service: ${request.booking.service.name}`);
    console.log(`   Scheduled: ${formatInIST(request.booking.scheduledAt)}`);

    // Update request and booking in a transaction
    const result = await prisma.$transaction(async (tx) => {
      // Update assignment request
      const updatedRequest = await tx.assignmentRequest.update({
        where: { id: requestId },
        data: {
          status: 'accepted',
          respondedAt: new Date()
        }
      });

      // Update booking
      const updatedBooking = await tx.booking.update({
        where: { id: request.bookingId },
        data: {
          status: 'CONFIRMED',
          assignmentStatus: 'ACCEPTED',
          maidId: req.user.id, // Assign maid user ID
          assignedAt: new Date(),
          maidResponseAt: new Date()
        },
        include: {
          customer: true,
          service: true
        }
      });

      return { updatedRequest, updatedBooking };
    });

    console.log(`✅ Request accepted successfully`);
    console.log(`   Updated Booking Status: ${result.updatedBooking.status}`);
    console.log(`   Assignment Status: ${result.updatedBooking.assignmentStatus}`);

    // Send notification to customer
    try {
      await prisma.notification.create({
        data: {
          userId: request.booking.customerId,
          type: 'BOOKING_CONFIRMED',
          title: 'Booking Confirmed',
          message: `Your booking for ${request.booking.service.name} on ${formatInIST(request.booking.scheduledAt)} has been confirmed by ${req.user.name}.`,
          data: {
            bookingId: request.bookingId,
            maidName: req.user.name,
            scheduledAt: request.booking.scheduledAt
          }
        }
      });
      console.log(`📧 Notification sent to customer`);
    } catch (notifError) {
      console.error(`⚠️  Failed to send notification:`, notifError.message);
    }

    res.json({
      success: true,
      message: 'Booking request accepted successfully',
      data: {
        requestId: result.updatedRequest.id,
        bookingId: result.updatedBooking.id,
        status: result.updatedBooking.status,
        assignmentStatus: result.updatedBooking.assignmentStatus,
        scheduledAt: result.updatedBooking.scheduledAt,
        scheduledAtIST: formatInIST(result.updatedBooking.scheduledAt)
      }
    });

  } catch (error) {
    console.error('❌ Error accepting request:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to accept booking request',
      error: error.message
    });
  }
};

/**
 * Reject a booking request
 */
const rejectRequest = async (req, res) => {
  try {
    const { requestId } = req.params;
    const { rejectionReason } = req.body;
    
    console.log(`\n❌ Processing REJECT request`);
    console.log(`   Request ID: ${requestId}`);
    console.log(`   Maid: ${req.user.name} (${req.user.id})`);
    console.log(`   Reason: ${rejectionReason}`);

    // Validate rejection reason
    if (!rejectionReason || rejectionReason.trim().length === 0) {
      console.log(`❌ Rejection reason is required`);
      return res.status(400).json({
        success: false,
        message: 'Rejection reason is required'
      });
    }

    // Find the maid profile
    const maidProfile = await prisma.maidProfile.findUnique({
      where: { userId: req.user.id }
    });
    
    if (!maidProfile) {
      console.log(`❌ Maid profile not found`);
      return res.status(400).json({
        success: false,
        message: 'Maid profile not found'
      });
    }

    // Find the assignment request
    const request = await prisma.assignmentRequest.findFirst({
      where: {
        id: requestId,
        maidId: maidProfile.id,
        status: 'pending'
      },
      include: {
        booking: {
          include: {
            customer: true,
            service: true
          }
        }
      }
    });

    if (!request) {
      console.log(`❌ Request not found or already processed`);
      return res.status(404).json({
        success: false,
        message: 'Request not found or already processed'
      });
    }

    console.log(`📋 Request details:`);
    console.log(`   Booking ID: ${request.bookingId}`);
    console.log(`   Customer: ${request.booking.customer.name}`);
    console.log(`   Service: ${request.booking.service.name}`);
    console.log(`   Scheduled: ${formatInIST(request.booking.scheduledAt)}`);

    // Update request and booking in a transaction
    const result = await prisma.$transaction(async (tx) => {
      // Update assignment request
      const updatedRequest = await tx.assignmentRequest.update({
        where: { id: requestId },
        data: {
          status: 'rejected',
          respondedAt: new Date(),
          rejectionReason: rejectionReason.trim()
        }
      });

      // Update booking for reassignment
      const updatedBooking = await tx.booking.update({
        where: { id: request.bookingId },
        data: {
          status: 'CANCELLED',
          assignmentStatus: 'REJECTED',
          rejectionReason: rejectionReason.trim(),
          reassignmentCount: {
            increment: 1
          },
          maidId: null // Remove maid assignment
        }
      });

      return { updatedRequest, updatedBooking };
    });

    console.log(`✅ Request rejected successfully`);
    console.log(`   Updated Booking Status: ${result.updatedBooking.status}`);
    console.log(`   Assignment Status: ${result.updatedBooking.assignmentStatus}`);
    console.log(`   Reassignment Count: ${result.updatedBooking.reassignmentCount}`);

    // Queue for admin reassignment
    try {
      console.log(`📋 Queueing for admin reassignment...`);
      await queueRejectedAssignment({
        bookingId: request.bookingId,
        maidId: maidProfile.id,
        rejectionReason: rejectionReason.trim(),
        customerId: request.booking.customerId
      });
      console.log(`✅ Queued for admin reassignment successfully`);
    } catch (queueError) {
      console.error(`❌ Failed to queue for reassignment:`, queueError.message);
      // Don't fail the request if queueing fails
    }

    // Send notification to admins
    try {
      const admins = await prisma.user.findMany({
        where: { role: 'ADMIN' },
        select: { id: true }
      });

      const adminNotifications = admins.map(admin => ({
        userId: admin.id,
        type: 'BOOKING_REJECTED',
        title: 'Booking Rejected - Needs Reassignment',
        message: `Maid ${req.user.name} rejected booking for ${request.booking.customer.name}. Reason: ${rejectionReason.trim()}`,
        data: {
          bookingId: request.bookingId,
          customerId: request.booking.customerId,
          maidId: maidProfile.id,
          rejectionReason: rejectionReason.trim(),
          scheduledAt: request.booking.scheduledAt
        }
      }));

      if (adminNotifications.length > 0) {
        await prisma.notification.createMany({
          data: adminNotifications
        });
        console.log(`📧 Notifications sent to ${admins.length} admins`);
      }
    } catch (notifError) {
      console.error(`⚠️  Failed to send admin notifications:`, notifError.message);
    }

    res.json({
      success: true,
      message: 'Booking request rejected successfully',
      data: {
        requestId: result.updatedRequest.id,
        bookingId: result.updatedBooking.id,
        status: result.updatedBooking.status,
        assignmentStatus: result.updatedBooking.assignmentStatus,
        rejectionReason: rejectionReason.trim(),
        reassignmentCount: result.updatedBooking.reassignmentCount,
        queuedForReassignment: true
      }
    });

  } catch (error) {
    console.error('❌ Error rejecting request:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reject booking request',
      error: error.message
    });
  }
};

/**
 * Get request history for the logged-in maid
 */
const getRequestHistory = async (req, res) => {
  try {
    console.log(`\n📜 Fetching request history for maid: ${req.user.name}`);

    const maidProfile = await prisma.maidProfile.findUnique({
      where: { userId: req.user.id }
    });
    
    if (!maidProfile) {
      return res.status(400).json({
        success: false,
        message: 'Maid profile not found'
      });
    }

    const requests = await prisma.assignmentRequest.findMany({
      where: {
        maidId: maidProfile.id
      },
      include: {
        booking: {
          include: {
            service: true,
            customer: {
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
        requestedAt: 'desc'
      },
      take: 50 // Limit to last 50 requests
    });

    console.log(`📊 Found ${requests.length} total requests in history`);

    const transformedRequests = requests.map(request => ({
      id: request.id,
      bookingId: request.bookingId,
      status: request.status,
      requestedAt: request.requestedAt,
      requestedAtIST: formatInIST(request.requestedAt),
      respondedAt: request.respondedAt,
      respondedAtIST: request.respondedAt ? formatInIST(request.respondedAt) : null,
      rejectionReason: request.rejectionReason,
      expiresAt: request.expiresAt,
      booking: {
        id: request.booking.id,
        scheduledAt: request.booking.scheduledAt,
        scheduledAtIST: formatInIST(request.booking.scheduledAt),
        timeSlot: request.booking.timeSlot,
        status: request.booking.status,
        service: {
          name: request.booking.service.name,
          category: request.booking.service.category
        },
        customer: {
          name: request.booking.customer.name
        }
      }
    }));

    res.json({
      success: true,
      count: transformedRequests.length,
      data: transformedRequests
    });

  } catch (error) {
    console.error('❌ Error fetching request history:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch request history',
      error: error.message
    });
  }
};

module.exports = {
  getPendingRequests,
  acceptRequest,
  rejectRequest,
  getRequestHistory
};
