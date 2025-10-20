const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Helper function to calculate expiry time (24 hours from now)
const getExpiryTime = (hoursFromNow = 24) => {
  const expiry = new Date();
  expiry.setHours(expiry.getHours() + hoursFromNow);
  return expiry;
};

// Helper function to transform booking data for frontend
const transformBookingForFrontend = (booking) => {
  return {
    id: booking.id,
    customerId: booking.customerId,
    maidId: booking.maidId,
    serviceId: booking.serviceId,
    status: booking.status,
    assignmentStatus: booking.assignmentStatus || 
      (booking.status === 'CANCELLED' && booking.rejectionReason ? 'REJECTED' :
       booking.maidId ? 'ASSIGNED_PENDING_RESPONSE' : 'PENDING_ASSIGNMENT'),
    scheduledAt: booking.scheduledAt,
    timeSlot: booking.timeSlot,
    serviceAddress: booking.serviceAddress,
    totalAmount: booking.totalAmount,
    finalAmount: booking.finalAmount,
    specialInstructions: booking.specialInstructions,
    assignedAt: booking.assignedAt,
    maidResponseAt: booking.maidResponseAt,
    rejectionReason: booking.rejectionReason,
    reassignmentCount: booking.reassignmentCount || 0,
    service: booking.service ? {
      id: booking.service.id,
      name: booking.service.name,
      description: booking.service.description,
      basePrice: booking.service.basePrice,
      category: booking.service.category,
      baseDuration: booking.service.baseDuration
    } : null,
    customer: booking.customer ? {
      id: booking.customer.id,
      name: booking.customer.name,
      email: booking.customer.email,
      phone: booking.customer.phone
    } : null,
    maid: booking.maid ? {
      id: booking.maid.id,
      name: booking.maid.name || 'Unknown',
      email: booking.maid.email || '',
      phone: booking.maid.phone || '',
      rating: 0 // We'll get this from MaidProfile if needed
    } : null
  };
};

// Helper function to transform assignment request for frontend
const transformAssignmentForFrontend = (assignment) => {
  return {
    id: assignment.id,
    bookingId: assignment.bookingId,
    maidId: assignment.maidId,
    customerId: assignment.booking?.customerId,
    status: assignment.status,
    requestedAt: assignment.requestedAt,
    respondedAt: assignment.respondedAt,
    rejectionReason: assignment.rejectionReason,
    expiresAt: assignment.expiresAt,
    booking: assignment.booking ? {
      id: assignment.booking.id,
      scheduledAt: assignment.booking.scheduledAt,
      timeSlot: assignment.booking.timeSlot,
      serviceAddress: assignment.booking.serviceAddress,
      specialInstructions: assignment.booking.specialInstructions,
      totalAmount: assignment.booking.totalAmount,
      service: assignment.booking.service ? {
        id: assignment.booking.service.id,
        name: assignment.booking.service.name,
        description: assignment.booking.service.description,
        category: assignment.booking.service.category,
        baseDuration: assignment.booking.service.baseDuration
      } : null,
      customer: assignment.booking.customer ? {
        id: assignment.booking.customer.id,
        name: assignment.booking.customer.name,
        email: assignment.booking.customer.email,
        phone: assignment.booking.customer.phone
      } : null
    } : null
  };
};

// MAID ASSIGNMENT ROUTES

// Get pending assignments for a maid
const getPendingAssignments = async (req, res) => {
  try {
    // Find the maid profile for this user
    const maidProfile = await prisma.maidProfile.findUnique({
      where: { userId: req.user.id }
    });
    
    if (!maidProfile) {
      return res.status(400).json({
        success: false,
        message: 'Maid profile not found'
      });
    }
    
    const maidId = maidProfile.id;

    const assignments = await prisma.assignmentRequest.findMany({
      where: {
        maidId: maidId,
        status: 'pending',
        expiresAt: {
          gt: new Date() // Only get non-expired assignments
        }
      },
      include: {
        booking: {
          include: {
            service: true,
            customer: true
          }
        }
      },
      orderBy: {
        requestedAt: 'desc'
      }
    });

    const transformedAssignments = assignments.map(transformAssignmentForFrontend);

    res.json({
      success: true,
      data: transformedAssignments
    });
  } catch (error) {
    console.error('Error fetching pending assignments:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch pending assignments'
    });
  }
};

// Get all assignments for a maid
const getMyAssignments = async (req, res) => {
  try {
    // Find the maid profile for this user
    const maidProfile = await prisma.maidProfile.findUnique({
      where: { userId: req.user.id }
    });
    
    if (!maidProfile) {
      return res.status(400).json({
        success: false,
        message: 'Maid profile not found'
      });
    }
    
    const maidId = maidProfile.id;

    const assignments = await prisma.assignmentRequest.findMany({
      where: {
        maidId: maidId
      },
      include: {
        booking: {
          include: {
            service: true,
            customer: true
          }
        }
      },
      orderBy: {
        requestedAt: 'desc'
      }
    });

    const transformedAssignments = assignments.map(transformAssignmentForFrontend);

    res.json({
      success: true,
      data: transformedAssignments
    });
  } catch (error) {
    console.error('Error fetching assignments:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch assignments'
    });
  }
};

// Accept an assignment
const acceptAssignment = async (req, res) => {
  try {
    const { assignmentId } = req.params;
    
    console.log(`🔍 Accepting assignment: ${assignmentId} by user: ${req.user.id}`);
    
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
    
    const maidId = maidProfile.id;
    console.log(`✅ Found maid profile: ${maidId} for user: ${req.user.id}`);

    // Find the assignment
    console.log(`🔍 Looking for assignment: ${assignmentId} with maidId: ${maidId} and status: pending`);
    
    // First try with maid profile ID match
    let assignment = await prisma.assignmentRequest.findFirst({
      where: {
        id: assignmentId,
        maidId: maidId,
        status: 'pending'
      },
      include: {
        booking: true
      }
    });

    // If not found, try finding assignment and check if current user owns the maid profile
    if (!assignment) {
      console.log(`🔍 Assignment not found with maidId: ${maidId}, checking if user owns this assignment...`);
      
      const anyAssignment = await prisma.assignmentRequest.findUnique({
        where: { id: assignmentId },
        include: {
          booking: true,
          maid: {
            include: {
              user: true
            }
          }
        }
      });

      if (anyAssignment && anyAssignment.maid.user.id === req.user.id && anyAssignment.status === 'pending') {
        console.log(`✅ Found assignment owned by current user: ${req.user.id}`);
        assignment = anyAssignment;
      }
    }

    if (!assignment) {
      console.log(`❌ Assignment not found with criteria: assignmentId=${assignmentId}, maidId=${maidId}, status=pending`);
      
      // Let's check if the assignment exists with different criteria
      const anyAssignment = await prisma.assignmentRequest.findUnique({
        where: { id: assignmentId }
      });
      
      if (anyAssignment) {
        console.log(`🔍 Assignment exists but with different criteria: maidId=${anyAssignment.maidId}, status=${anyAssignment.status}`);
      } else {
        console.log(`❌ Assignment ${assignmentId} does not exist at all`);
      }
      
      return res.status(404).json({
        success: false,
        message: 'Assignment not found or already processed'
      });
    }

    console.log(`✅ Found assignment: ${assignment.id} for booking: ${assignment.bookingId}`);

    // Check if assignment has expired
    if (new Date() > assignment.expiresAt) {
      return res.status(400).json({
        success: false,
        message: 'Assignment has expired'
      });
    }

    // Update assignment and booking in a transaction
    const result = await prisma.$transaction(async (tx) => {
      // Update assignment request
      const updatedAssignment = await tx.assignmentRequest.update({
        where: { id: assignmentId },
        data: {
          status: 'accepted',
          respondedAt: new Date()
        },
        include: {
          booking: {
            include: {
              service: true,
              customer: true
            }
          }
        }
      });

      // Update booking status
      await tx.booking.update({
        where: { id: assignment.bookingId },
        data: {
          status: 'CONFIRMED',
          assignmentStatus: 'ACCEPTED',
          maidResponseAt: new Date()
        }
      });

      return updatedAssignment;
    });

    res.json({
      success: true,
      data: transformAssignmentForFrontend(result),
      message: 'Assignment accepted successfully'
    });
  } catch (error) {
    console.error('Error accepting assignment:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to accept assignment'
    });
  }
};

// Reject an assignment
const rejectAssignment = async (req, res) => {
  try {
    const { assignmentId } = req.params;
    const { rejectionReason } = req.body;
    
    console.log(`🔍 Rejecting assignment: ${assignmentId}, Reason: ${rejectionReason}`);
    
    // Find the maid profile for this user
    const maidProfile = await prisma.maidProfile.findUnique({
      where: { userId: req.user.id }
    });
    
    if (!maidProfile) {
      return res.status(400).json({
        success: false,
        message: 'Maid profile not found'
      });
    }
    
    const maidId = maidProfile.id;

    if (!rejectionReason || rejectionReason.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Rejection reason is required'
      });
    }

    // Find the assignment
    const assignment = await prisma.assignmentRequest.findFirst({
      where: {
        id: assignmentId,
        maidId: maidId,
        status: 'pending'
      },
      include: {
        booking: true
      }
    });

    if (!assignment) {
      return res.status(404).json({
        success: false,
        message: 'Assignment not found or already processed'
      });
    }

    // Update assignment and booking in a transaction
    console.log(`🔍 Starting rejection transaction for booking: ${assignment.bookingId}`);
    const result = await prisma.$transaction(async (tx) => {
      console.log('🔍 Updating assignment request status to rejected...');
      // Update assignment request
      const updatedAssignment = await tx.assignmentRequest.update({
        where: { id: assignmentId },
        data: {
          status: 'rejected',
          respondedAt: new Date(),
          rejectionReason: rejectionReason.trim()
        },
        include: {
          booking: {
            include: {
              service: true,
              customer: true
            }
          }
        }
      });

      console.log('🔍 Updating booking status to CANCELLED for reassignment...');
      console.log(`📋 Booking ID to update: ${assignment.bookingId}`);
      
      // Update booking status and increment reassignment count
      const updatedBooking = await tx.booking.update({
        where: { id: assignment.bookingId },
        data: {
          status: 'CANCELLED', // Set status to CANCELLED for reassignment
          assignmentStatus: 'REJECTED', // Mark as rejected for reassignment
          rejectionReason: rejectionReason.trim(),
          reassignmentCount: {
            increment: 1
          },
          maidId: null // Remove maid assignment
        }
      });
      
      console.log('✅ Booking updated successfully:', {
        id: updatedBooking.id,
        status: updatedBooking.status,
        assignmentStatus: updatedBooking.assignmentStatus,
        rejectionReason: updatedBooking.rejectionReason,
        reassignmentCount: updatedBooking.reassignmentCount
      });

      console.log('✅ Booking updated for reassignment');
      return updatedAssignment;
    });

    console.log(`✅ Assignment ${assignmentId} rejected successfully, booking ${assignment.bookingId} moved to reassignment queue`);

    res.json({
      success: true,
      data: transformAssignmentForFrontend(result),
      message: 'Assignment rejected successfully'
    });
  } catch (error) {
    console.error('Error rejecting assignment:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reject assignment'
    });
  }
};

// ADMIN ASSIGNMENT ROUTES

// Get all assignments (admin)
const getAllAssignments = async (req, res) => {
  try {
    const assignments = await prisma.assignmentRequest.findMany({
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

    const transformedAssignments = assignments.map(transformAssignmentForFrontend);

    res.json({
      success: true,
      data: transformedAssignments
    });
  } catch (error) {
    console.error('Error fetching all assignments:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch assignments'
    });
  }
};

// Create assignment for a booking (admin)
const createAssignment = async (req, res) => {
  try {
    const { bookingId, maidId, expiresIn = 24 } = req.body;

    if (!bookingId || !maidId) {
      return res.status(400).json({
        success: false,
        message: 'Booking ID and Maid ID are required'
      });
    }

    // Verify booking exists and is assignable
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        service: true,
        customer: true
      }
    });

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    // Verify maid exists and is active
    const maid = await prisma.maid.findUnique({
      where: { id: maidId },
      include: {
        user: true
      }
    });

    if (!maid || maid.status !== 'ACTIVE') {
      return res.status(400).json({
        success: false,
        message: 'Maid not found or not active'
      });
    }

    // Create assignment and update booking in a transaction
    const result = await prisma.$transaction(async (tx) => {
      // Create assignment request
      const assignment = await tx.assignmentRequest.create({
        data: {
          bookingId,
          maidId,
          status: 'pending',
          requestedAt: new Date(),
          expiresAt: getExpiryTime(expiresIn)
        },
        include: {
          booking: {
            include: {
              service: true,
              customer: true
            }
          }
        }
      });

      // Update booking
      await tx.booking.update({
        where: { id: bookingId },
        data: {
          maidId,
          status: 'ASSIGNED',
          assignmentStatus: 'ASSIGNED_PENDING_RESPONSE',
          assignedAt: new Date()
        }
      });

      return assignment;
    });

    res.json({
      success: true,
      data: transformAssignmentForFrontend(result),
      message: 'Assignment created successfully'
    });
  } catch (error) {
    console.error('Error creating assignment:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create assignment'
    });
  }
};

// Get assignment statistics (admin)
const getAssignmentStats = async (req, res) => {
  try {
    const [
      totalAssignments,
      pendingAssignments,
      acceptedAssignments,
      rejectedAssignments,
      expiredAssignments
    ] = await Promise.all([
      prisma.assignmentRequest.count(),
      prisma.assignmentRequest.count({ where: { status: 'pending' } }),
      prisma.assignmentRequest.count({ where: { status: 'accepted' } }),
      prisma.assignmentRequest.count({ where: { status: 'rejected' } }),
      prisma.assignmentRequest.count({ 
        where: { 
          status: 'pending',
          expiresAt: { lt: new Date() }
        } 
      })
    ]);

    const stats = {
      totalAssignments,
      pendingAssignments,
      acceptedAssignments,
      rejectedAssignments,
      expiredAssignments,
      acceptanceRate: totalAssignments > 0 ? (acceptedAssignments / totalAssignments * 100).toFixed(2) : 0
    };

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Error fetching assignment stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch assignment statistics'
    });
  }
};

// Get assignment by ID (admin)
const getAssignmentById = async (req, res) => {
  try {
    const { assignmentId } = req.params;

    const assignment = await prisma.assignmentRequest.findUnique({
      where: { id: assignmentId },
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
      }
    });

    if (!assignment) {
      return res.status(404).json({
        success: false,
        message: 'Assignment not found'
      });
    }

    res.json({
      success: true,
      data: transformAssignmentForFrontend(assignment)
    });
  } catch (error) {
    console.error('Error fetching assignment:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch assignment'
    });
  }
};

// Cancel assignment (admin)
const cancelAssignment = async (req, res) => {
  try {
    const { assignmentId } = req.params;

    const assignment = await prisma.assignmentRequest.findUnique({
      where: { id: assignmentId },
      include: { booking: true }
    });

    if (!assignment) {
      return res.status(404).json({
        success: false,
        message: 'Assignment not found'
      });
    }

    // Cancel assignment and reset booking in a transaction
    await prisma.$transaction(async (tx) => {
      // Update assignment
      await tx.assignmentRequest.update({
        where: { id: assignmentId },
        data: {
          status: 'cancelled',
          respondedAt: new Date()
        }
      });

      // Reset booking
      await tx.booking.update({
        where: { id: assignment.bookingId },
        data: {
          maidId: null,
          status: 'PENDING',
          assignmentStatus: 'PENDING_ASSIGNMENT',
          assignedAt: null,
          maidResponseAt: null
        }
      });
    });

    res.json({
      success: true,
      message: 'Assignment cancelled successfully'
    });
  } catch (error) {
    console.error('Error cancelling assignment:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to cancel assignment'
    });
  }
};

// ADMIN BOOKING MANAGEMENT ROUTES (for dashboard sections)

// Get bookings that need assignment (admin)
const getPendingAssignmentBookings = async (req, res) => {
  try {
    console.log('🔍 Fetching pending assignment bookings...');
    
    const bookings = await prisma.booking.findMany({
      where: {
        status: 'PENDING',
        maidId: null
      },
      include: {
        service: true,
        customer: true
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    console.log(`✅ Found ${bookings.length} pending assignment bookings`);
    
    const transformedBookings = bookings.map(booking => transformBookingForFrontend(booking));

    console.log('✅ Successfully transformed bookings for frontend');
    
    res.json({
      success: true,
      data: transformedBookings
    });
  } catch (error) {
    console.error('❌ Error fetching pending assignment bookings:', error);
    console.error('❌ Error details:', {
      message: error.message,
      code: error.code,
      stack: error.stack
    });
    res.status(500).json({
      success: false,
      message: 'Failed to fetch pending assignment bookings',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Get bookings assigned to maids (admin)
const getAssignedBookings = async (req, res) => {
  try {
    console.log('🔍 Fetching assigned bookings...');
    
    const bookings = await prisma.booking.findMany({
      where: {
        maidId: { not: null },
        status: {
          in: ['ASSIGNED', 'CONFIRMED', 'IN_PROGRESS']
        }
      },
      include: {
        service: true,
        customer: true,
        maid: true
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    console.log(`✅ Found ${bookings.length} assigned bookings`);
    
    const transformedBookings = bookings.map(booking => transformBookingForFrontend(booking));

    console.log('✅ Successfully transformed assigned bookings for frontend');
    
    res.json({
      success: true,
      data: transformedBookings
    });
  } catch (error) {
    console.error('❌ Error fetching assigned bookings:', error);
    console.error('❌ Error details:', {
      message: error.message,
      code: error.code,
      stack: error.stack
    });
    res.status(500).json({
      success: false,
      message: 'Failed to fetch assigned bookings',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Get available maids for assignment (admin)
const getAvailableMaids = async (req, res) => {
  try {
    const { bookingId } = req.params;
    console.log(`🔍 Fetching available maids for booking: ${bookingId}`);

    // Get booking details to check service requirements
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        service: true
      }
    });

    if (!booking) {
      console.log(`❌ Booking not found: ${bookingId}`);
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    console.log(`✅ Found booking: ${booking.service.name}`);

    // Get all active maids
    const maids = await prisma.maidProfile.findMany({
      where: {
        status: 'ACTIVE'
      },
      include: {
        user: true,
        assignmentRequests: {
          where: {
            status: 'pending',
            expiresAt: {
              gt: new Date()
            }
          }
        }
      }
    });

    console.log(`✅ Found ${maids.length} active maids`);

    // Transform maid data for frontend
    const availableMaids = maids.map(maid => ({
      id: maid.user.id, // Use User.id instead of MaidProfile.id
      maidProfileId: maid.id, // Keep MaidProfile.id for reference
      name: maid.user.name,
      email: maid.user.email,
      phone: maid.user.phone,
      rating: maid.rating,
      completedBookings: maid.completedBookings,
      skills: maid.skills,
      isAvailable: maid.assignmentRequests.length < (maid.maxDailyBookings || 5),
      currentAssignments: maid.assignmentRequests.length,
      maxDailyBookings: maid.maxDailyBookings || 5
    }));

    console.log(`✅ Transformed ${availableMaids.length} available maids for frontend`);

    res.json({
      success: true,
      data: availableMaids
    });
  } catch (error) {
    console.error('❌ Error fetching available maids:', error);
    console.error('❌ Error details:', {
      message: error.message,
      code: error.code,
      stack: error.stack
    });
    res.status(500).json({
      success: false,
      message: 'Failed to fetch available maids',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Send assignment request to maid (admin)
const sendAssignmentRequest = async (req, res) => {
  try {
    const { bookingId, maidId, expiresIn = 24 } = req.body;
    console.log(`🔍 Sending assignment request - Booking: ${bookingId}, Maid: ${maidId}, Expires: ${expiresIn}h`);

    if (!bookingId || !maidId) {
      console.log('❌ Missing required fields: bookingId or maidId');
      return res.status(400).json({
        success: false,
        message: 'Booking ID and Maid ID are required'
      });
    }

    // Verify booking exists and is assignable
    console.log('🔍 Verifying booking exists and is assignable...');
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        service: true,
        customer: true
      }
    });

    if (!booking) {
      console.log(`❌ Booking not found: ${bookingId}`);
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    console.log(`✅ Found booking: ${booking.service.name}, Status: ${booking.status}`);

    // Allow assignment for PENDING bookings or CANCELLED bookings (for reassignment)
    const isAvailableForAssignment = 
      (booking.status === 'PENDING' && booking.maidId === null) ||
      (booking.status === 'CANCELLED' && booking.rejectionReason !== null);

    if (!isAvailableForAssignment) {
      console.log(`❌ Booking not available for assignment - Status: ${booking.status}, MaidId: ${booking.maidId}, RejectionReason: ${booking.rejectionReason}`);
      return res.status(400).json({
        success: false,
        message: 'Booking is not available for assignment'
      });
    }

    console.log(`✅ Booking is available for ${booking.status === 'CANCELLED' ? 'reassignment' : 'assignment'}`);

    // Verify maid exists and is active
    console.log('🔍 Verifying maid exists and is active...');
    
    // First find the user (since maidId from frontend is User.id)
    const user = await prisma.user.findUnique({
      where: { id: maidId },
      include: {
        maidProfile: true
      }
    });

    if (!user || !user.maidProfile || user.maidProfile.status !== 'ACTIVE') {
      console.log(`❌ Maid not found or not active: ${maidId}, Status: ${user?.maidProfile?.status}`);
      return res.status(400).json({
        success: false,
        message: 'Maid not found or not active'
      });
    }

    console.log(`✅ Found maid: ${user.name}, Status: ${user.maidProfile.status}`);

    // Create assignment request and update booking in a transaction
    console.log('🔍 Creating assignment request and updating booking...');
    const result = await prisma.$transaction(async (tx) => {
      console.log('🔍 Creating assignment request...');
      // Create assignment request (use MaidProfile.id for AssignmentRequest)
      const assignment = await tx.assignmentRequest.create({
        data: {
          bookingId,
          maidId: user.maidProfile.id, // Use MaidProfile.id for AssignmentRequest
          status: 'pending',
          requestedAt: new Date(),
          expiresAt: getExpiryTime(expiresIn)
        },
        include: {
          booking: {
            include: {
              service: true,
              customer: true
            }
          }
        }
      });

      console.log(`✅ Created assignment request: ${assignment.id}`);

      console.log('🔍 Updating booking status...');
      // Update booking (use User.id for Booking.maidId)
      await tx.booking.update({
        where: { id: bookingId },
        data: {
          maidId, // This is User.id, correct for Booking.maidId foreign key
          status: 'ASSIGNED',
          assignmentStatus: 'ASSIGNED_PENDING_RESPONSE', // Reset assignment status
          rejectionReason: null, // Clear previous rejection reason for reassignment
          assignedAt: new Date() // Track when assignment was made
        }
      });

      console.log('✅ Updated booking status to ASSIGNED');

      return assignment;
    });

    console.log('✅ Transaction completed successfully');

    const isReassignment = booking.status === 'CANCELLED';
    const message = isReassignment 
      ? 'Reassignment request sent to maid successfully'
      : 'Assignment request sent to maid successfully';

    res.json({
      success: true,
      data: transformAssignmentForFrontend(result),
      message: message
    });
  } catch (error) {
    console.error('❌ Error sending assignment request:', error);
    console.error('❌ Error details:', {
      message: error.message,
      code: error.code,
      stack: error.stack
    });
    res.status(500).json({
      success: false,
      message: 'Failed to send assignment request',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Get bookings that need reassignment (admin)
const getReassignmentBookings = async (req, res) => {
  try {
    console.log('🔍 Fetching reassignment bookings...');
    
    // First, let's see all bookings with rejected assignment requests
    const allBookingsWithRejectedRequests = await prisma.booking.findMany({
      include: {
        assignmentRequests: {
          where: {
            status: 'rejected'
          }
        }
      }
    });
    
    console.log(`📊 Total bookings with rejected requests: ${allBookingsWithRejectedRequests.filter(b => b.assignmentRequests.length > 0).length}`);
    
    // Get bookings that need reassignment - focus on assignmentStatus
    const bookings = await prisma.booking.findMany({
      where: {
        OR: [
          {
            // Bookings with assignment status indicating reassignment needed
            assignmentStatus: 'REJECTED'
          },
          {
            // Bookings marked for reassignment
            assignmentStatus: 'REASSIGNED'
          },
          {
            // Legacy: Bookings rejected by maid (old flow)
            status: 'CANCELLED',
            rejectionReason: { not: null },
            maidId: null
          }
        ]
      },
      include: {
        service: true,
        customer: true,
        maid: true,
        assignmentRequests: {
          where: {
            status: 'rejected'
          },
          include: {
            maid: {
              include: {
                user: true
              }
            }
          },
          orderBy: {
            respondedAt: 'desc'
          },
          take: 1 // Get the most recent rejection
        }
      },
      orderBy: {
        updatedAt: 'desc'
      }
    });

    console.log(`✅ Found ${bookings.length} reassignment bookings`);
    
    // Debug: Log each booking's key fields
    bookings.forEach((booking, index) => {
      console.log(`📋 Reassignment Booking ${index + 1}:`, {
        id: booking.id,
        status: booking.status,
        rejectionReason: booking.rejectionReason,
        maidId: booking.maidId,
        customerName: booking.customer?.name
      });
    });
    
    const transformedBookings = bookings.map(booking => {
      const transformed = transformBookingForFrontend(booking);
      
      // Add rejection details from the most recent rejected assignment request
      if (booking.assignmentRequests && booking.assignmentRequests.length > 0) {
        const rejectedRequest = booking.assignmentRequests[0];
        transformed.lastRejectedBy = {
          maidId: rejectedRequest.maidId,
          maidName: rejectedRequest.maid?.user?.name || 'Unknown',
          rejectionReason: rejectedRequest.rejectionReason,
          rejectedAt: rejectedRequest.respondedAt
        };
      }
      
      return transformed;
    });

    // Debug: Log transformed bookings
    transformedBookings.forEach((booking, index) => {
      console.log(`🔄 Transformed Booking ${index + 1}:`, {
        id: booking.id,
        status: booking.status,
        assignmentStatus: booking.assignmentStatus,
        rejectionReason: booking.rejectionReason
      });
    });

    console.log('✅ Successfully transformed reassignment bookings for frontend');
    
    res.json({
      success: true,
      data: transformedBookings
    });
  } catch (error) {
    console.error('❌ Error fetching reassignment bookings:', error);
    console.error('❌ Error details:', {
      message: error.message,
      code: error.code,
      stack: error.stack
    });
    res.status(500).json({
      success: false,
      message: 'Failed to fetch reassignment bookings',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

module.exports = {
  // Maid routes
  getPendingAssignments,
  getMyAssignments,
  acceptAssignment,
  rejectAssignment,
  
  // Admin routes
  getAllAssignments,
  createAssignment,
  getAssignmentStats,
  getAssignmentById,
  cancelAssignment,
  
  // Admin booking management routes
  getPendingAssignmentBookings,
  getAssignedBookings,
  getReassignmentBookings,
  getAvailableMaids,
  sendAssignmentRequest
};
