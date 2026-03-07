const { getPrismaClient } = require('../utils/database');
const { PrismaClient } = require('@prisma/client');
const prisma = getPrismaClient();
const JobScheduler = require('../services/jobScheduler');

// Assign a maid to a customer (Admin only)
const assignMaidToCustomer = async (req, res) => {
  try {
    const { customerId, maidId, notes } = req.body;

    // Validate required fields
    if (!customerId || !maidId) {
      return res.status(400).json({
        success: false,
        message: 'Customer ID and Maid ID are required'
      });
    }

    // Check if customer exists and is a customer
    const customer = await prisma.user.findFirst({
      where: {
        id: customerId,
        role: 'CUSTOMER'
      }
    });

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: 'Customer not found'
      });
    }

    // Check if maid exists and is active - handle both User ID and MaidProfile ID
    let maid = await prisma.maidProfile.findFirst({
      where: {
        id: maidId,
        status: 'ACTIVE'
      },
      include: {
        user: true
      }
    });

    // If not found by MaidProfile ID, try to find by User ID
    if (!maid) {
      maid = await prisma.maidProfile.findFirst({
        where: {
          userId: maidId,
          status: 'ACTIVE'
        },
        include: {
          user: true
        }
      });
    }

    if (!maid) {
      // Debug: Check if maid exists with any status (try both IDs)
      let maidAnyStatus = await prisma.maidProfile.findFirst({
        where: { id: maidId },
        include: { user: true }
      });

      if (!maidAnyStatus) {
        maidAnyStatus = await prisma.maidProfile.findFirst({
          where: { userId: maidId },
          include: { user: true }
        });
      }

      if (!maidAnyStatus) {
        // If maidId is actually a user id, return an actionable 400 so admins know what to fix
        const maidUser = await prisma.user.findUnique({
          where: { id: maidId }
        });

        if (maidUser && maidUser.role === 'MAID') {
          return res.status(400).json({
            success: false,
            message: `Maid user exists but MaidProfile not found for userId: ${maidId}. Please ensure the maid has completed profile/verification so MaidProfile is created.`,
            error: 'MAID_PROFILE_NOT_CREATED'
          });
        }

        return res.status(404).json({
          success: false,
          message: `Maid profile not found with ID: ${maidId} (checked both MaidProfile ID and User ID)`
        });
      } else {
        return res.status(400).json({
          success: false,
          message: `Maid found but status is '${maidAnyStatus.status}', not 'ACTIVE'. Maid name: ${maidAnyStatus.user?.name || 'Unknown'}`,
          error: 'MAID_NOT_ACTIVE'
        });
      }
    }

    // Check for maid assignment conflicts
    await checkMaidAssignmentConflicts(maid.id, customerId);

    // Clean up expired assignment requests for this customer
    await prisma.customerAssignmentRequest.updateMany({
      where: {
        customerId: customerId,
        status: 'pending',
        expiresAt: {
          lt: new Date()
        }
      },
      data: {
        status: 'expired'
      }
    });

    // Cancel any existing pending requests for this customer (allows re-assignment)
    const existingPendingRequests = await prisma.customerAssignmentRequest.findMany({
      where: {
        customerId: customerId,
        status: 'pending',
        expiresAt: {
          gte: new Date()
        }
      }
    });

    if (existingPendingRequests.length > 0) {
      await prisma.customerAssignmentRequest.updateMany({
        where: {
          id: { in: existingPendingRequests.map(r => r.id) }
        },
        data: {
          status: 'cancelled'
        }
      });
      console.log(`🔄 Cancelled ${existingPendingRequests.length} existing pending request(s) for customer ${customerId}`);
    }

    // Create assignment request for tracking/notification
    console.log('🔄 Creating assignment request:', {
      customerId,
      maidId: maid.id,
      requestedBy: req.user.id,
      notes
    });

    // Use a transaction to create both the request and the actual assignment atomically
    const result = await prisma.$transaction(async (tx) => {
      // Create the assignment request record (for tracking)
      const assignmentRequest = await tx.customerAssignmentRequest.create({
        data: {
          customerId: customerId,
          maidId: maid.id,
          requestedBy: req.user.id,
          notes: notes,
          status: 'accepted', // Auto-accepted since admin is directly assigning
          respondedAt: new Date(),
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
        },
        include: {
          customer: true,
          maid: {
            include: {
              user: true
            }
          },
          admin: {
            select: {
              id: true,
              name: true,
              email: true
            }
          }
        }
      });

      // Check if customer already has an active assignment
      const existingAssignment = await tx.customerMaidAssignment.findFirst({
        where: {
          customerId: customerId,
          isActive: true
        }
      });

      let assignment;
      if (existingAssignment) {
        // Update existing assignment with new maid
        assignment = await tx.customerMaidAssignment.update({
          where: { id: existingAssignment.id },
          data: {
            maidId: maid.id,
            notes: notes,
            assignedAt: new Date()
          },
          include: {
            customer: true,
            maid: {
              include: { user: true }
            }
          }
        });
      } else {
        // Create new assignment
        assignment = await tx.customerMaidAssignment.create({
          data: {
            customerId: customerId,
            maidId: maid.id,
            notes: notes,
            isActive: true,
            assignedAt: new Date()
          },
          include: {
            customer: true,
            maid: {
              include: { user: true }
            }
          }
        });
      }

      return { assignmentRequest, assignment };
    });

    console.log('✅ Assignment created successfully:', result.assignment.id);

    // Create notifications for both customer and maid
    try {
      await prisma.notification.createMany({
        data: [
          {
            userId: customerId,
            type: 'MAID_ASSIGNED',
            title: 'Homecare Partner Assigned',
            message: `${result.assignment.maid.user.name} has been assigned as your homecare partner.`
          },
          {
            userId: result.assignment.maid.userId,
            type: 'SERVICE_ASSIGNED',
            title: 'New Customer Assignment',
            message: `You have been assigned to serve ${result.assignment.customer.name}.`
          }
        ]
      });
    } catch (notifError) {
      console.error('⚠️ Failed to create notifications:', notifError);
      // Don't fail the request if notification creation fails
    }

    // Schedule background jobs for automatic booking creation
    try {
      const timeSlot = result.assignment.customer.timeSlot;
      await JobScheduler.onNewAssignment(
        customerId,
        maid.id,
        timeSlot
      );
      console.log('✅ Background jobs scheduled for customer assignment');
    } catch (jobError) {
      console.error('⚠️ Failed to schedule background jobs:', jobError);
    }

    return res.status(201).json({
      success: true,
      message: 'Homecare partner assigned successfully',
      data: result.assignment
    });

  } catch (error) {
    console.error('Assign maid to customer error:', error);

    // Handle specific conflict errors
    if (error.message.startsWith('TIMESLOT_CONFLICT:')) {
      return res.status(409).json({
        success: false,
        message: 'Timeslot conflict detected',
        error: error.message.replace('TIMESLOT_CONFLICT: ', ''),
        conflictType: 'TIMESLOT_CONFLICT'
      });
    }

    if (error.message.startsWith('CAPACITY_EXCEEDED:')) {
      return res.status(409).json({
        success: false,
        message: 'Maid capacity exceeded',
        error: error.message.replace('CAPACITY_EXCEEDED: ', ''),
        conflictType: 'CAPACITY_EXCEEDED'
      });
    }

    return res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};

// Get customer's current maid assignment
const getCustomerAssignment = async (req, res) => {
  try {
    const { customerId } = req.params;

    const assignment = await prisma.customerMaidAssignment.findFirst({
      where: {
        customerId: customerId,
        isActive: true
      },
      include: {
        customer: true,
        maid: {
          include: {
            user: true
          }
        }
      }
    });

    return res.status(200).json({
      success: true,
      data: assignment
    });

  } catch (error) {
    console.error('Get customer assignment error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};

// Update customer's maid assignment
const updateCustomerAssignment = async (req, res) => {
  try {
    const { customerId } = req.params;
    const { maidId, notes, isActive } = req.body;

    const assignment = await prisma.customerMaidAssignment.findFirst({
      where: {
        customerId: customerId,
        isActive: true
      }
    });

    if (!assignment) {
      return res.status(404).json({
        success: false,
        message: 'No active assignment found for this customer'
      });
    }

    const updateData = {};
    if (maidId !== undefined) updateData.maidId = maidId;
    if (notes !== undefined) updateData.notes = notes;
    if (isActive !== undefined) updateData.isActive = isActive;

    const updatedAssignment = await prisma.customerMaidAssignment.update({
      where: {
        id: assignment.id
      },
      data: updateData,
      include: {
        customer: true,
        maid: {
          include: {
            user: true
          }
        }
      }
    });

    return res.status(200).json({
      success: true,
      message: 'Assignment updated successfully',
      data: updatedAssignment
    });

  } catch (error) {
    console.error('Update customer assignment error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};

// Get all customer-maid assignments (Admin only)
const getAllCustomerAssignments = async (req, res) => {
  try {
    console.log('🔍 Fetching all customer-maid assignments...');

    const { page = 1, limit = 20, customerId, maidId, isActive } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const where = {};
    if (customerId) where.customerId = customerId;
    if (maidId) where.maidId = maidId;
    if (isActive !== undefined) where.isActive = isActive === 'true';

    console.log('📋 Query parameters:', { page, limit, customerId, maidId, isActive });

    const [assignments, totalCount] = await Promise.all([
      prisma.customerMaidAssignment.findMany({
        where,
        include: {
          customer: {
            select: {
              id: true,
              name: true,
              email: true,
              phone: true,
              address: true,
              timeSlot: true,
              status: true
            }
          },
          maid: {
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                  phone: true,
                  status: true
                }
              }
            }
          }
        },
        orderBy: {
          assignedAt: 'desc'
        },
        skip,
        take: parseInt(limit)
      }),
      prisma.customerMaidAssignment.count({ where })
    ]);

    console.log(`✅ Found ${assignments.length} assignments out of ${totalCount} total`);

    const totalPages = Math.ceil(totalCount / parseInt(limit));

    // Transform assignments for better frontend display
    const transformedAssignments = assignments.map(assignment => ({
      id: assignment.id,
      customerId: assignment.customerId,
      maidId: assignment.maidId,
      isActive: assignment.isActive,
      assignedAt: assignment.assignedAt,
      notes: assignment.notes,
      createdAt: assignment.createdAt,
      updatedAt: assignment.updatedAt,
      customer: {
        id: assignment.customer.id,
        name: assignment.customer.name,
        email: assignment.customer.email,
        phone: assignment.customer.phone,
        address: assignment.customer.address,
        timeSlot: assignment.customer.timeSlot,
        status: assignment.customer.status
      },
      maid: {
        id: assignment.maid.id,
        userId: assignment.maid.userId,
        name: assignment.maid.user.name,
        email: assignment.maid.user.email,
        phone: assignment.maid.user.phone,
        status: assignment.maid.user.status,
        rating: assignment.maid.rating,
        skills: assignment.maid.skills,
        completedBookings: assignment.maid.completedBookings
      }
    }));

    return res.status(200).json({
      success: true,
      data: {
        assignments: transformedAssignments,
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          totalCount,
          hasNextPage: parseInt(page) < totalPages,
          hasPrevPage: parseInt(page) > 1
        }
      }
    });

  } catch (error) {
    console.error('❌ Get all customer assignments error:', error);
    console.error('❌ Error details:', {
      message: error.message,
      code: error.code,
      stack: error.stack
    });
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Get customer status including assignment and buffer info
const getCustomerStatus = async (req, res) => {
  try {
    const { customerId } = req.params;

    console.log(`🔍 Getting customer status for ID: ${customerId}`);

    // Validate customerId
    if (!customerId) {
      return res.status(400).json({
        success: false,
        message: 'Customer ID is required'
      });
    }

    // Get customer assignment
    const assignment = await prisma.customerMaidAssignment.findFirst({
      where: {
        customerId: customerId,
        isActive: true
      },
      include: {
        customer: true,
        maid: {
          include: {
            user: true
          }
        }
      }
    });

    console.log(`📋 Customer assignment found: ${assignment ? 'Yes' : 'No'}`);

    // Get customer's subscription first
    const subscription = await prisma.subscription.findFirst({
      where: {
        customer: {
          userId: customerId
        },
        status: {
          in: ['ACTIVE', 'PENDING_PAYMENT']
        }
      },
      include: {
        plan: true
      }
    });

    // Get active buffer period only if customer has a subscription
    let activeBufferPeriod = null;
    if (subscription) {
      activeBufferPeriod = await prisma.bufferPeriod.findFirst({
        where: {
          subscriptionId: subscription.id,
          status: 'ACTIVE',
          startDate: {
            lte: new Date()
          },
          endDate: {
            gte: new Date()
          }
        }
      });
    }

    // Get next booking (if any)
    const nextBooking = await prisma.booking.findFirst({
      where: {
        customerId: customerId,
        scheduledAt: {
          gte: new Date()
        },
        status: {
          in: ['PENDING', 'CONFIRMED', 'ASSIGNED', 'IN_PROGRESS']
        }
      },
      orderBy: {
        scheduledAt: 'asc'
      }
    });

    // Get last booking
    const lastBooking = await prisma.booking.findFirst({
      where: {
        customerId: customerId,
        scheduledAt: {
          lt: new Date()
        }
      },
      orderBy: {
        scheduledAt: 'desc'
      }
    });

    const customerStatus = {
      customerId: customerId,
      hasAssignment: !!assignment,
      hasSubscription: !!subscription,
      assignment: assignment ? {
        id: assignment.id,
        assignedAt: assignment.assignedAt,
        notes: assignment.notes,
        customer: {
          id: assignment.customer.id,
          name: assignment.customer.name,
          email: assignment.customer.email,
          phone: assignment.customer.phone,
          address: assignment.customer.address
        },
        maid: {
          id: assignment.maid.id,
          name: assignment.maid.user.name,
          email: assignment.maid.user.email,
          phone: assignment.maid.user.phone,
          rating: assignment.maid.rating,
          skills: assignment.maid.skills,
          completedBookings: assignment.maid.completedBookings,
          weeklyOffDay: assignment.maid.weeklyOffDay
        }
      } : null,
      subscription: subscription ? {
        id: subscription.id,
        planName: subscription.plan?.name || 'Unknown Plan',
        status: subscription.status,
        startDate: subscription.startDate,
        endDate: subscription.endDate,
        sessionsPerWeek: subscription.plan?.sessionsPerWeek,
        sessionsPerMonth: subscription.plan?.sessionsPerMonth,
        isInBufferPeriod: subscription.isInBufferPeriod,
        bufferStartDate: subscription.bufferStartDate,
        bufferEndDate: subscription.bufferEndDate
      } : null,
      isInBufferPeriod: !!activeBufferPeriod,
      bufferPeriod: activeBufferPeriod ? {
        id: activeBufferPeriod.id,
        startDate: activeBufferPeriod.startDate,
        endDate: activeBufferPeriod.endDate,
        status: activeBufferPeriod.status,
        reason: activeBufferPeriod.reason
      } : null,
      nextBookingDate: nextBooking?.scheduledAt || null,
      lastBookingDate: lastBooking?.scheduledAt || null
    };

    console.log(`✅ Customer status retrieved successfully for customer: ${customerId}`);

    return res.status(200).json({
      success: true,
      data: customerStatus
    });

  } catch (error) {
    console.error('❌ Get customer status error:', error);
    console.error('❌ Error details:', {
      message: error.message,
      code: error.code,
      stack: error.stack
    });
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Get customer's own status (for customers to check their own status)
const getMyCustomerStatus = async (req, res) => {
  try {
    const customerId = req.user.id; // Get customer ID from authenticated user

    console.log(`🔍 Getting customer status for authenticated customer: ${customerId}`);

    // Get customer assignment
    const assignment = await prisma.customerMaidAssignment.findFirst({
      where: {
        customerId: customerId,
        isActive: true
      },
      include: {
        customer: true,
        maid: {
          include: {
            user: true
          }
        }
      }
    });

    console.log(`📋 Customer assignment found: ${assignment ? 'Yes' : 'No'}`);

    // Get customer's subscription first
    const subscription = await prisma.subscription.findFirst({
      where: {
        customer: {
          userId: customerId
        },
        status: {
          in: ['ACTIVE', 'PENDING_PAYMENT']
        }
      }
    });

    // Get active buffer period only if customer has a subscription
    let activeBufferPeriod = null;
    if (subscription) {
      activeBufferPeriod = await prisma.bufferPeriod.findFirst({
        where: {
          subscriptionId: subscription.id,
          status: 'ACTIVE',
          startDate: {
            lte: new Date()
          },
          endDate: {
            gte: new Date()
          }
        }
      });
    }

    // Get next booking (if any)
    const nextBooking = await prisma.booking.findFirst({
      where: {
        customerId: customerId,
        scheduledAt: {
          gte: new Date()
        },
        status: {
          in: ['PENDING', 'CONFIRMED', 'ASSIGNED', 'IN_PROGRESS']
        }
      },
      orderBy: {
        scheduledAt: 'asc'
      }
    });

    // Get last booking
    const lastBooking = await prisma.booking.findFirst({
      where: {
        customerId: customerId,
        scheduledAt: {
          lt: new Date()
        }
      },
      orderBy: {
        scheduledAt: 'desc'
      }
    });

    const customerStatus = {
      customerId: customerId,
      hasAssignment: !!assignment,
      hasSubscription: !!subscription,
      assignment: assignment ? {
        id: assignment.id,
        assignedAt: assignment.assignedAt,
        notes: assignment.notes,
        customer: {
          id: assignment.customer.id,
          name: assignment.customer.name,
          email: assignment.customer.email,
          phone: assignment.customer.phone,
          address: assignment.customer.address
        },
        maid: {
          id: assignment.maid.id,
          name: assignment.maid.user.name,
          email: assignment.maid.user.email,
          phone: assignment.maid.user.phone,
          rating: assignment.maid.rating,
          skills: assignment.maid.skills,
          completedBookings: assignment.maid.completedBookings
        }
      } : null,
      subscription: subscription ? {
        id: subscription.id,
        status: subscription.status,
        startDate: subscription.startDate,
        endDate: subscription.endDate
      } : null,
      isInBufferPeriod: !!activeBufferPeriod,
      bufferPeriod: activeBufferPeriod ? {
        id: activeBufferPeriod.id,
        startDate: activeBufferPeriod.startDate,
        endDate: activeBufferPeriod.endDate,
        status: activeBufferPeriod.status,
        reason: activeBufferPeriod.reason
      } : null,
      nextBookingDate: nextBooking?.scheduledAt || null,
      lastBookingDate: lastBooking?.scheduledAt || null
    };

    console.log(`✅ Customer status retrieved successfully for customer: ${customerId}`);

    return res.status(200).json({
      success: true,
      data: customerStatus
    });

  } catch (error) {
    console.error('❌ Get my customer status error:', error);
    console.error('❌ Error details:', {
      message: error.message,
      code: error.code,
      stack: error.stack
    });
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Remove customer assignment
const removeCustomerAssignment = async (req, res) => {
  try {
    const { customerId } = req.params;

    const assignment = await prisma.customerMaidAssignment.findFirst({
      where: {
        customerId: customerId,
        isActive: true
      }
    });

    if (!assignment) {
      return res.status(404).json({
        success: false,
        message: 'No active assignment found for this customer'
      });
    }

    await prisma.customerMaidAssignment.update({
      where: {
        id: assignment.id
      },
      data: {
        isActive: false
      }
    });

    return res.status(200).json({
      success: true,
      message: 'Customer assignment removed successfully'
    });

  } catch (error) {
    console.error('Remove customer assignment error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};

// Check maid status (debug function)
const checkMaidStatus = async (req, res) => {
  try {
    const { maidId } = req.params;

    const maid = await prisma.maidProfile.findFirst({
      where: {
        OR: [
          { id: maidId },
          { userId: maidId }
        ]
      },
      include: { user: true }
    });

    if (!maid) {
      return res.status(404).json({
        success: false,
        message: 'Maid profile not found'
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        id: maid.id,
        status: maid.status,
        name: maid.user?.name,
        email: maid.user?.email,
        phone: maid.user?.phone,
        rating: maid.rating,
        skills: maid.skills,
        isFloatingMaid: maid.isFloatingMaid
      }
    });

  } catch (error) {
    console.error('Check maid status error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};

// Helper function to check for maid assignment conflicts
const checkMaidAssignmentConflicts = async (maidId, customerId) => {
  try {
    // Get the customer's timeslot
    const customer = await prisma.user.findUnique({
      where: { id: customerId },
      select: { timeSlot: true, name: true }
    });

    if (!customer?.timeSlot) {
      // If customer doesn't have a timeslot, no conflict check needed
      return;
    }

    // Find all other customers assigned to this maid
    const existingAssignments = await prisma.customerMaidAssignment.findMany({
      where: {
        maidId: maidId,
        isActive: true,
        customerId: {
          not: customerId // Exclude the current customer
        }
      },
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            timeSlot: true
          }
        }
      }
    });

    // Check for timeslot conflicts
    const conflictingCustomers = existingAssignments.filter(assignment => {
      const assignedCustomer = assignment.customer;
      return assignedCustomer.timeSlot &&
        assignedCustomer.timeSlot === customer.timeSlot;
    });

    if (conflictingCustomers.length > 0) {
      const conflictNames = conflictingCustomers.map(c => c.customer.name).join(', ');
      throw new Error(`TIMESLOT_CONFLICT: Maid is already assigned to customer(s) with the same timeslot (${customer.timeSlot}): ${conflictNames}`);
    }

    // Check maid's maximum daily bookings capacity.
    // Also fetch userId here to avoid an N+1 nested query below.
    const maidProfile = await prisma.maidProfile.findUnique({
      where: { id: maidId },
      select: { maxDailyBookings: true, userId: true }
    });

    if (maidProfile && existingAssignments.length >= maidProfile.maxDailyBookings) {
      throw new Error(`CAPACITY_EXCEEDED: Maid has reached maximum daily booking capacity (${maidProfile.maxDailyBookings}). Currently assigned to ${existingAssignments.length} customers.`);
    }

    // Additional check: look for active future bookings in the same timeslot.
    // FIX (M4): replaced nested prisma.user.findMany().then() N+1 pattern with a
    // direct userId reference obtained from the maidProfile query above.
    if (customer.timeSlot && maidProfile?.userId) {
      const conflictingBookings = await prisma.booking.findMany({
        where: {
          maidId: maidProfile.userId, // single indexed field lookup – no sub-query
          timeSlot: customer.timeSlot,
          status: {
            in: ['PENDING', 'CONFIRMED', 'ASSIGNED', 'IN_PROGRESS']
          },
          scheduledAt: {
            gte: new Date()
          }
        },
        include: {
          customer: {
            select: { name: true }
          }
        },
        take: 5
      });

      if (conflictingBookings.length > 0) {
        const bookingCustomers = conflictingBookings.map(b => b.customer.name).join(', ');
        // Warning-only: bookings may be on different calendar days
        // eslint-disable-next-line no-console
        console.warn(`Maid has ${conflictingBookings.length} existing booking(s) in timeslot ${customer.timeSlot} with: ${bookingCustomers}`);
      }
    }

  } catch (error) {
    if (error.message.startsWith('TIMESLOT_CONFLICT:') || error.message.startsWith('CAPACITY_EXCEEDED:')) {
      throw error; // Re-throw our custom conflict errors
    }
    console.error('Error checking maid assignment conflicts:', error);
    // Don't block assignment for unexpected errors, just log them
  }
};

// Get assignment requests for a maid
const getMaidAssignmentRequests = async (req, res) => {
  try {
    const maidUserId = req.user.id;
    console.log('🔍 Getting assignment requests for maid user ID:', maidUserId);

    // Get maid profile
    const maidProfile = await prisma.maidProfile.findFirst({
      where: { userId: maidUserId }
    });

    console.log('👤 Maid profile found:', maidProfile ? `ID: ${maidProfile.id}` : 'Not found');

    if (!maidProfile) {
      return res.status(404).json({
        success: false,
        message: 'Maid profile not found'
      });
    }

    // First, let's check all assignment requests for this maid (including expired ones)
    const allRequests = await prisma.customerAssignmentRequest.findMany({
      where: {
        maidId: maidProfile.id
      },
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
        admin: {
          select: {
            name: true,
            email: true
          }
        }
      },
      orderBy: {
        requestedAt: 'desc'
      }
    });

    console.log('📋 Total assignment requests for this maid:', allRequests.length);
    console.log('📋 All requests:', allRequests.map(r => ({
      id: r.id,
      status: r.status,
      expiresAt: r.expiresAt,
      customerName: r.customer.name
    })));

    const assignmentRequests = await prisma.customerAssignmentRequest.findMany({
      where: {
        maidId: maidProfile.id,
        status: 'pending',
        expiresAt: {
          gte: new Date()
        }
      },
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
        admin: {
          select: {
            name: true,
            email: true
          }
        }
      },
      orderBy: {
        requestedAt: 'desc'
      }
    });

    console.log('✅ Pending assignment requests found:', assignmentRequests.length);

    return res.status(200).json({
      success: true,
      data: assignmentRequests
    });

  } catch (error) {
    console.error('Get maid assignment requests error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};

// Accept assignment request
const acceptAssignmentRequest = async (req, res) => {
  try {
    const { requestId } = req.params;
    const maidUserId = req.user.id;

    // Get maid profile
    const maidProfile = await prisma.maidProfile.findFirst({
      where: { userId: maidUserId }
    });

    if (!maidProfile) {
      return res.status(404).json({
        success: false,
        message: 'Maid profile not found'
      });
    }

    // Get the assignment request
    const assignmentRequest = await prisma.customerAssignmentRequest.findFirst({
      where: {
        id: requestId,
        maidId: maidProfile.id,
        status: 'pending'
      },
      include: {
        customer: true
      }
    });

    if (!assignmentRequest) {
      return res.status(404).json({
        success: false,
        message: 'Assignment request not found or already processed'
      });
    }

    // Check if request has expired
    if (assignmentRequest.expiresAt < new Date()) {
      return res.status(410).json({
        success: false,
        message: 'Assignment request has expired'
      });
    }

    // Start transaction to ensure data consistency
    const result = await prisma.$transaction(async (tx) => {
      // Update assignment request status
      await tx.customerAssignmentRequest.update({
        where: { id: requestId },
        data: {
          status: 'accepted',
          respondedAt: new Date()
        }
      });

      // Check if customer already has an active assignment
      const existingAssignment = await tx.customerMaidAssignment.findFirst({
        where: {
          customerId: assignmentRequest.customerId,
          isActive: true
        }
      });

      if (existingAssignment) {
        // Update existing assignment
        const updatedAssignment = await tx.customerMaidAssignment.update({
          where: { id: existingAssignment.id },
          data: {
            maidId: maidProfile.id,
            notes: assignmentRequest.notes,
            assignedAt: new Date()
          },
          include: {
            customer: true,
            maid: {
              include: { user: true }
            }
          }
        });
        return updatedAssignment;
      } else {
        // Create new assignment
        const newAssignment = await tx.customerMaidAssignment.create({
          data: {
            customerId: assignmentRequest.customerId,
            maidId: maidProfile.id,
            notes: assignmentRequest.notes,
            isActive: true,
            assignedAt: new Date()
          },
          include: {
            customer: true,
            maid: {
              include: { user: true }
            }
          }
        });
        return newAssignment;
      }
    });

    // Schedule background jobs for automatic assignment requests
    try {
      const timeSlot = assignmentRequest.customer.timeSlot;
      await JobScheduler.onNewAssignment(
        assignmentRequest.customerId,
        maidProfile.id,
        timeSlot
      );
      console.log('✅ Background jobs scheduled for customer assignment');
    } catch (jobError) {
      console.error('⚠️ Failed to schedule background jobs:', jobError);
      // Don't fail the request if job scheduling fails
    }

    return res.status(200).json({
      success: true,
      message: 'Assignment request accepted successfully',
      data: result
    });

  } catch (error) {
    console.error('Accept assignment request error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};

// Reject assignment request
const rejectAssignmentRequest = async (req, res) => {
  try {
    const { requestId } = req.params;
    const { rejectionReason } = req.body;
    const maidUserId = req.user.id;

    // Get maid profile
    const maidProfile = await prisma.maidProfile.findFirst({
      where: { userId: maidUserId }
    });

    if (!maidProfile) {
      return res.status(404).json({
        success: false,
        message: 'Maid profile not found'
      });
    }

    // Get the assignment request
    const assignmentRequest = await prisma.customerAssignmentRequest.findFirst({
      where: {
        id: requestId,
        maidId: maidProfile.id,
        status: 'pending'
      }
    });

    if (!assignmentRequest) {
      return res.status(404).json({
        success: false,
        message: 'Assignment request not found or already processed'
      });
    }

    // Update assignment request status
    const updatedRequest = await prisma.customerAssignmentRequest.update({
      where: { id: requestId },
      data: {
        status: 'rejected',
        respondedAt: new Date(),
        rejectionReason: rejectionReason || 'No reason provided'
      },
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      }
    });

    return res.status(200).json({
      success: true,
      message: 'Assignment request rejected successfully',
      data: updatedRequest
    });

  } catch (error) {
    console.error('Reject assignment request error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};

// Get all assignment requests (Admin only)
const getAllAssignmentRequests = async (req, res) => {
  try {
    const { status, maidId, customerId, page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const where = {};
    if (status) where.status = status;
    if (maidId) where.maidId = maidId;
    if (customerId) where.customerId = customerId;

    const [requests, totalCount] = await Promise.all([
      prisma.customerAssignmentRequest.findMany({
        where,
        include: {
          customer: {
            select: {
              id: true,
              name: true,
              email: true,
              phone: true,
              timeSlot: true
            }
          },
          maid: {
            include: {
              user: {
                select: {
                  name: true,
                  email: true,
                  phone: true
                }
              }
            }
          },
          admin: {
            select: {
              name: true,
              email: true
            }
          }
        },
        orderBy: {
          requestedAt: 'desc'
        },
        skip,
        take: parseInt(limit)
      }),
      prisma.customerAssignmentRequest.count({ where })
    ]);

    const totalPages = Math.ceil(totalCount / parseInt(limit));

    return res.status(200).json({
      success: true,
      data: {
        requests,
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          totalCount,
          hasNextPage: parseInt(page) < totalPages,
          hasPrevPage: parseInt(page) > 1
        }
      }
    });

  } catch (error) {
    console.error('Get all assignment requests error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};

// Test assignment request creation
const testCreateAssignmentRequest = async (req, res) => {
  try {
    console.log('🧪 Testing assignment request creation...');

    // Get first customer and first maid for testing
    const customer = await prisma.user.findFirst({
      where: { role: 'CUSTOMER' }
    });

    const maid = await prisma.maidProfile.findFirst({
      include: { user: true }
    });

    const admin = await prisma.user.findFirst({
      where: { role: 'ADMIN' }
    });

    if (!customer || !maid || !admin) {
      return res.status(404).json({
        success: false,
        message: 'Missing test data - need at least one customer, maid, and admin'
      });
    }

    console.log('📝 Test data found:', {
      customer: customer.name,
      maid: maid.user.name,
      admin: admin.name
    });

    // Create test assignment request
    const testRequest = await prisma.customerAssignmentRequest.create({
      data: {
        customerId: customer.id,
        maidId: maid.id,
        requestedBy: admin.id,
        notes: 'Test assignment request',
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
      },
      include: {
        customer: true,
        maid: {
          include: { user: true }
        },
        admin: true
      }
    });

    console.log('✅ Test assignment request created:', testRequest.id);

    return res.status(201).json({
      success: true,
      message: 'Test assignment request created successfully',
      data: testRequest
    });

  } catch (error) {
    console.error('❌ Test creation error:', error);
    return res.status(500).json({
      success: false,
      message: 'Test failed',
      error: error.message
    });
  }
};

// Get current user's maid assignment
const getMyMaidAssignment = async (req, res) => {
  try {
    const userId = req.user.id;

    // Get user to verify they are a customer
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        customerProfile: true
      }
    });

    if (!user || user.role !== 'CUSTOMER') {
      return res.status(403).json({
        success: false,
        message: 'Only customers can view their maid assignment'
      });
    }

    // Get customer's active maid assignment
    const assignment = await prisma.customerMaidAssignment.findFirst({
      where: {
        customerId: userId,
        isActive: true
      },
      include: {
        maid: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                phone: true,
                profileImage: true,
                bio: true
              }
            }
          }
        }
      }
    });

    if (!assignment) {
      return res.status(200).json({
        success: true,
        data: null,
        message: 'No active maid assignment found'
      });
    }

    // Format response with maid details
    const formattedAssignment = {
      id: assignment.id,
      assignedAt: assignment.assignedAt,
      notes: assignment.notes,
      status: 'ACTIVE',
      maid: {
        id: assignment.maid.id,
        name: assignment.maid.user.name,
        email: assignment.maid.user.email,
        phone: assignment.maid.user.phone,
        photoUrl: assignment.maid.user.profileImage,
        bio: assignment.maid.user.bio,
        rating: assignment.maid.rating || 0,
        totalServices: assignment.maid.totalRatings || 0,
        experience: `${assignment.maid.experienceYears || 0} years`,
        skills: assignment.maid.skills || [],
        languages: assignment.maid.languages || [],
        isAvailable: assignment.maid.status === 'ACTIVE',
        monthlySchedule: [] // Can be populated with actual schedule if needed
      }
    };

    return res.status(200).json({
      success: true,
      data: formattedAssignment
    });

  } catch (error) {
    console.error('Get my maid assignment error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};

/**
 * Get all customers assigned to a specific maid
 */
const getMaidAssignedCustomers = async (req, res) => {
  try {
    const { maidId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    console.log(`🔍 Getting customers assigned to maid ID: ${maidId} with pagination. Page: ${page}, Limit: ${limit}`);

    // Validate maidId
    if (!maidId) {
      return res.status(400).json({
        success: false,
        message: 'Maid ID is required'
      });
    }

    const totalCount = await prisma.customerMaidAssignment.count({
      where: {
        maidId: maidId,
        isActive: true
      }
    });

    // Get paginated active assignments for this maid
    const assignments = await prisma.customerMaidAssignment.findMany({
      where: {
        maidId: maidId,
        isActive: true
      },
      include: {
        customer: true // No need for nested 'user', 'customer' points to User model
      },
      skip,
      take: limit,
      orderBy: {
        assignedAt: 'desc'
      }
    });

    console.log(`📋 Found ${assignments.length} assignments for maid ${maidId} on page ${page}`);

    // Get subscription details for each customer
    const customersWithDetails = await Promise.all(
      assignments.map(async (assignment) => {
        const subscription = await prisma.subscription.findFirst({
          where: {
            customerId: assignment.customer.id,
            status: {
              in: ['ACTIVE', 'PENDING_PAYMENT']
            }
          },
          include: {
            plan: true
          }
        });

        // Use assignment.customer directly since it represents the User table
        return {
          id: assignment.customer.id,
          name: assignment.customer.name,
          email: assignment.customer.email,
          phone: assignment.customer.phone,
          timeSlot: assignment.customer.timeSlot,
          planName: subscription?.plan?.name || 'No Plan',
          sessionsPerWeek: subscription?.plan?.sessionsPerWeek || 0,
          subscriptionStatus: subscription?.status || 'NO_SUBSCRIPTION',
          assignedAt: assignment.assignedAt
        };
      })
    );

    console.log(`✅ Customers with details retrieved for maid: ${maidId}`);

    return res.status(200).json({
      success: true,
      data: customersWithDetails,
      pagination: {
        total: totalCount,
        page,
        limit,
        totalPages: Math.ceil(totalCount / limit)
      }
    });

  } catch (error) {
    console.error('❌ Get maid assigned customers error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};

module.exports = {
  assignMaidToCustomer,
  getCustomerAssignment,
  updateCustomerAssignment,
  getAllCustomerAssignments,
  getCustomerStatus,
  getMyCustomerStatus,
  getMaidAssignedCustomers,
  removeCustomerAssignment,
  checkMaidStatus,
  getMaidAssignmentRequests,
  acceptAssignmentRequest,
  rejectAssignmentRequest,
  getAllAssignmentRequests,
  testCreateAssignmentRequest,
  getMyMaidAssignment
};
