const { getPrismaClient } = require('../utils/database');
const { PrismaClient } = require('@prisma/client');
const notificationService = require('../services/notificationService');
const bookingDeduplicationService = require('../services/bookingDeduplicationService');
const { publishNotificationEvent } = require('../notifications/events/publishEvent');
const { NOTIFICATION_TOPICS } = require('../notifications/events/topics');
const prisma = getPrismaClient();

const createBooking = async (req, res) => {
  try {
    // Extract data from request
    const { scheduledDate, timeSlot, serviceAddress } = req.body;
    const customerId = req.user.id;

    // Validate required field
    if (!scheduledDate) {
      return res.status(400).json({
        success: false,
        message: 'scheduledDate is required'
      });
    }

    // Get user data including timeSlot and address
    const user = await prisma.user.findUnique({
      where: { id: customerId },
      select: {
        id: true,
        timeSlot: true,
        address: true
      }
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found.'
      });
    }

    // Use data from frontend request or fallback to user profile
    const finalTimeSlot = timeSlot || user.timeSlot;
    const finalAddress = serviceAddress || user.address;

    // Default fallbacks if neither frontend nor user profile has the data
    if (!finalTimeSlot) {
      // Set a default timeslot if none provided
      console.warn('No timeslot provided, using default 09:00-12:00');
    }

    if (!finalAddress) {
      return res.status(400).json({
        success: false,
        message: 'Service address is required. Please provide an address or set one in your profile.'
      });
    }

    // Parse timeSlot (format: "14:00-17:00") - use final timeslot with fallback
    const effectiveTimeSlot = finalTimeSlot || '09:00-12:00'; // Default fallback

    let startTime, endTime;
    try {
      [startTime, endTime] = effectiveTimeSlot.split('-');

      if (!startTime || !endTime) {
        throw new Error('Invalid timeslot format');
      }
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: 'Invalid timeslot format. Expected format: "HH:MM-HH:MM"'
      });
    }

    // Calculate service duration from time slot
    const startMinutes = parseInt(startTime.split(':')[0]) * 60 + parseInt(startTime.split(':')[1]);
    const endMinutes = parseInt(endTime.split(':')[0]) * 60 + parseInt(endTime.split(':')[1]);
    const durationMinutes = endMinutes - startMinutes;

    if (durationMinutes <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid timeslot: end time must be after start time'
      });
    }

    // Combine date and time into a single DateTime object
    let scheduledAt;
    try {
      scheduledAt = new Date(`${scheduledDate}T${startTime}:00`);

      // Validate the date
      if (isNaN(scheduledAt.getTime())) {
        throw new Error('Invalid date/time');
      }

      // Check if the requested date is in the past
      const now = new Date();
      if (scheduledAt < now) {
        return res.status(400).json({
          success: false,
          message: 'Cannot create bookings for past dates'
        });
      }
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: 'Invalid scheduledDate format. Please use YYYY-MM-DD format.'
      });
    }

    // Get customer profile with active subscription
    let customerProfile = await prisma.customerProfile.findUnique({
      where: { userId: customerId },
      include: {
        subscription: {
          where: {
            status: 'ACTIVE',
            endDate: { gte: new Date() }
          },
          include: {
            plan: {
              include: {
                service: true
              }
            }
          }
        }
      }
    });

    if (!customerProfile) {
      return res.status(403).json({
        success: false,
        message: 'Customer profile not found. Please complete your profile setup first.'
      });
    }

    // Check subscription and get service from it
    if (!customerProfile.subscription) {
      return res.status(403).json({
        success: false,
        message: 'Booking not allowed. Only customers with active subscriptions can book maid services. Please subscribe to a plan first.',
        requiresSubscription: true
      });
    }

    // Check if customer is in buffer period
    if (customerProfile.subscription.isInBufferPeriod) {
      // Get active buffer period details
      const activeBufferPeriod = await prisma.bufferPeriod.findFirst({
        where: {
          subscriptionId: customerProfile.subscription.id,
          status: 'ACTIVE',
          startDate: { lte: new Date() },
          endDate: { gte: new Date() }
        }
      });

      if (activeBufferPeriod) {
        return res.status(403).json({
          success: false,
          message: `Booking not allowed. Your services are currently paused due to an active buffer period until ${new Date(activeBufferPeriod.endDate).toLocaleDateString()}. Please wait until your buffer period ends to book new services.`,
          isInBufferPeriod: true,
          bufferEndDate: activeBufferPeriod.endDate,
          bufferDaysRemaining: Math.ceil((new Date(activeBufferPeriod.endDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))
        });
      }
    }

    // Check if the requested booking date falls within any active buffer period
    // Extract just the date part for comparison (ignore time)
    const bookingDate = new Date(scheduledDate); // Use scheduledDate string directly
    const bookingDateOnly = new Date(bookingDate.getFullYear(), bookingDate.getMonth(), bookingDate.getDate());

    console.log(`🔍 Checking buffer conflict for booking date: ${scheduledDate} (${bookingDateOnly.toISOString()})`);

    const bufferConflict = await prisma.bufferPeriod.findFirst({
      where: {
        subscriptionId: customerProfile.subscription.id,
        status: 'ACTIVE',
        startDate: { lte: bookingDateOnly },
        endDate: { gte: bookingDateOnly }
      }
    });

    if (bufferConflict) {
      console.log(`❌ Buffer conflict found: ${bufferConflict.startDate} to ${bufferConflict.endDate}`);
    } else {
      console.log(`✅ No buffer conflict for date: ${scheduledDate}`);
    }

    if (bufferConflict) {
      return res.status(403).json({
        success: false,
        message: `Cannot book service for ${scheduledAt.toLocaleDateString()}. This date falls within your buffer period (${new Date(bufferConflict.startDate).toLocaleDateString()} - ${new Date(bufferConflict.endDate).toLocaleDateString()}). Please choose a date outside your buffer period.`,
        isInBufferPeriod: true,
        bufferStartDate: bufferConflict.startDate,
        bufferEndDate: bufferConflict.endDate
      });
    }

    // Get service from subscription plan
    const service = customerProfile.subscription.plan.service;
    if (!service) {
      return res.status(400).json({
        success: false,
        message: 'No service found in your subscription plan. Please contact support.'
      });
    }

    // Calculate estimated end time based on time slot
    const estimatedEndTime = new Date(scheduledAt);
    estimatedEndTime.setMinutes(estimatedEndTime.getMinutes() + durationMinutes);

    // Customer has active subscription - create booking as PENDING for admin assignment
    const bookingData = {
      customerId,
      serviceId: service.id,
      serviceAddress: finalAddress, // Use finalAddress (from request or user profile)
      status: 'PENDING', // Changed to PENDING so admin can assign maid
      assignmentStatus: 'PENDING_ASSIGNMENT', // Set initial assignment status
      scheduledAt,
      timeSlot: effectiveTimeSlot, // Store the timeslot in dedicated field
      estimatedDuration: durationMinutes, // Use duration from time slot
      totalAmount: service.basePrice || 0, // Use service price if available
      finalAmount: 0, // No charge for subscription customers
      discount: service.basePrice || 0, // Discount the full amount for subscription customers
      specialInstructions: `Preferred Time: ${effectiveTimeSlot}` // Add timeslot info for reference
    };

    // Create the booking
    const booking = await prisma.booking.create({
      data: bookingData,
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
    });

    console.log(`✅ Booking created: ${booking.id}, checking for buffer period and assigned maid...`);

    // Check if customer is in buffer period
    const subscription = await prisma.subscription.findFirst({
      where: {
        customerId: customerId,
        status: 'ACTIVE'
      }
    });

    if (subscription) {
      const activeBufferPeriod = await prisma.bufferPeriod.findFirst({
        where: {
          subscriptionId: subscription.id,
          status: 'ACTIVE',
          startDate: { lte: new Date() },
          endDate: { gte: new Date() }
        }
      });

      if (activeBufferPeriod) {
        console.log(`🚫 Customer is in active buffer period: ${activeBufferPeriod.id}`);

        // Cancel the booking as customer is in buffer period
        await prisma.booking.update({
          where: { id: booking.id },
          data: {
            status: 'CANCELLED',
            rejectionReason: 'Booking cancelled: Customer is in active buffer period'
          }
        });

        return res.status(400).json({
          success: false,
          message: `Booking cannot be created during buffer period. Your services are paused until ${new Date(activeBufferPeriod.endDate).toLocaleDateString()}.`,
          error: 'BUFFER_PERIOD_ACTIVE',
          bufferEndDate: activeBufferPeriod.endDate
        });
      }
    }

    // Check if customer has an assigned maid
    const customerAssignment = await prisma.customerMaidAssignment.findFirst({
      where: {
        customerId: customerId,
        isActive: true
      },
      include: {
        maid: {
          include: {
            user: true
          }
        }
      }
    });

    let responseMessage = 'Booking request submitted successfully.';
    let assignmentStatus = 'PENDING_ASSIGNMENT';

    if (customerAssignment) {
      console.log(`✅ Found assigned maid: ${customerAssignment.maid.user.name}, auto-sending assignment request...`);

      try {
        // Check for duplicate booking request using Redis
        const canProceed = await bookingDeduplicationService.checkAndMark(
          customerId,
          customerAssignment.maidId,
          scheduledDate,
          48 * 60 * 60 // 48 hours TTL
        );

        if (!canProceed) {
          console.log(`🚫 Duplicate booking request prevented for customer ${customerId} with maid ${customerAssignment.maidId}`);
          responseMessage = 'A booking request has already been sent to your assigned maid for this date. Please wait for their response.';
          assignmentStatus = 'PENDING_ASSIGNMENT';
        } else {
          // Automatically send assignment request to assigned maid
          const expiresAt = new Date();
          expiresAt.setHours(expiresAt.getHours() + 24); // 24 hour expiry

          await prisma.$transaction(async (tx) => {
            // Create assignment request
            await tx.assignmentRequest.create({
              data: {
                bookingId: booking.id,
                maidId: customerAssignment.maidId,
                status: 'pending',
                requestedAt: new Date(),
                expiresAt: expiresAt
              }
            });

            // Update booking status
            await tx.booking.update({
              where: { id: booking.id },
              data: {
                maidId: customerAssignment.maid.userId, // User ID for booking
                status: 'ASSIGNED',
                assignmentStatus: 'ASSIGNED_PENDING_RESPONSE',
                assignedAt: new Date()
              }
            });
          });

          responseMessage = `Booking request sent to your assigned maid (${customerAssignment.maid.user.name}). You will be notified once they respond.`;
          assignmentStatus = 'ASSIGNED_PENDING_RESPONSE';

          console.log(`✅ Assignment request sent automatically to maid: ${customerAssignment.maid.user.name}`);
        }
      } catch (assignmentError) {
        console.error('❌ Failed to auto-assign maid:', assignmentError);
        responseMessage = 'Booking created but failed to auto-assign maid. Admin will assign manually.';
      }
    } else {
      console.log('ℹ️ No assigned maid found, booking will require admin assignment');
      responseMessage = 'Booking request submitted successfully. Admin will assign a maid shortly.';
    }

    await publishNotificationEvent({
      topic: NOTIFICATION_TOPICS.BOOKING_CREATED,
      payload: { bookingId: booking.id },
      dedupeKey: `booking-created:${booking.id}`
    });

    if (customerAssignment && assignmentStatus === 'ASSIGNED_PENDING_RESPONSE') {
      await publishNotificationEvent({
        topic: NOTIFICATION_TOPICS.BOOKING_MAID_ASSIGNED,
        payload: { bookingId: booking.id },
        dedupeKey: `booking-maid-assigned:${booking.id}:${customerAssignment.maid.userId}`
      });
    }

    // Return successful response
    res.status(201).json({
      success: true,
      data: {
        booking
      },
      message: responseMessage,
      hasActiveSubscription: true,
      status: assignmentStatus,
      autoAssigned: !!customerAssignment
    });

  } catch (error) {
    console.error('Error creating booking:', error);

    // Handle Prisma specific errors
    if (error.code === 'P2002') {
      return res.status(400).json({
        message: 'A booking conflict occurred'
      });
    }

    res.status(500).json({
      message: 'Failed to create booking',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

const getAllBookings = async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;

    // Build where clause based on status filter
    let whereClause = {};

    // Apply status filtering based on frontend requirements
    if (status) {
      switch (status.toLowerCase()) {
        case 'scheduled':
          // Include bookings that are confirmed, assigned, or in progress
          whereClause.status = { in: ['CONFIRMED', 'ASSIGNED', 'IN_PROGRESS'] };
          break;
        case 'completed':
          whereClause.status = 'COMPLETED';
          break;
        case 'cancelled':
          whereClause.status = 'CANCELLED';
          break;
        case 'all':
        default:
          // No additional filter - return all bookings
          break;
      }
    }

    // Calculate pagination
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Get total count for pagination
    const totalBookings = await prisma.booking.count({ where: whereClause });

    const bookings = await prisma.booking.findMany({
      where: whereClause,
      include: {
        service: true,
        customer: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true
          }
        },
        maid: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true
          }
        }
      },
      orderBy: {
        scheduledAt: 'desc' // Most recent first
      },
      skip,
      take: limitNum
    });

    res.json({
      success: true,
      data: bookings,
      pagination: {
        currentPage: pageNum,
        totalPages: Math.ceil(totalBookings / limitNum),
        totalBookings,
        hasNext: pageNum * limitNum < totalBookings,
        hasPrev: pageNum > 1
      },
      filters: {
        applied: status || 'all',
        available: ['all', 'scheduled', 'completed', 'cancelled']
      }
    });
  } catch (error) {
    console.error('Error fetching bookings:', error.message || error);
    console.error('Stack trace:', error.stack);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch bookings',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

const getBookingById = async (req, res) => {
  try {
    const { id } = req.params;
    const booking = await prisma.booking.findUnique({
      where: { id },
      include: {
        service: true,
        customer: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true
          }
        },
        maid: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true
          }
        }
      }
    });

    if (!booking) {
      return res.status(404).json({ message: 'Booking not found' });
    }

    res.json(booking);
  } catch (error) {
    console.error('Error fetching booking:', error);
    res.status(500).json({ message: 'Failed to fetch booking' });
  }
};

const getUserBookings = async (req, res) => {
  try {
    const userId = req.user.id;
    const { status, cursor, limit = 10 } = req.query;

    // Build where clause based on status filter
    let whereClause = {
      customerId: userId
    };

    // Apply status filtering based on frontend requirements
    if (status) {
      switch (status.toLowerCase()) {
        case 'scheduled':
          // Include bookings that are confirmed, assigned, or in progress
          whereClause.status = { in: ['CONFIRMED', 'ASSIGNED', 'IN_PROGRESS'] };
          break;
        case 'completed':
          whereClause.status = 'COMPLETED';
          break;
        case 'cancelled':
          whereClause.status = 'CANCELLED';
          break;
        case 'all':
        default:
          // No additional filter - return all bookings
          break;
      }
    }

    // Allow larger limits for dashboard needs but cap at reasonable number
    const pageSize = Math.max(1, Math.min(parseInt(limit, 10) || 10, 100));

    const findArgs = {
      where: whereClause,
      include: {
        service: true,
        maid: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true
          }
        }
      },
      orderBy: { id: 'desc' },
      take: pageSize + 1
    };

    if (cursor) {
      findArgs.cursor = { id: cursor };
      findArgs.skip = 1;
    }

    try {
      const results = await prisma.booking.findMany(findArgs);
      const hasNextPage = results.length > pageSize;
      const items = hasNextPage ? results.slice(0, pageSize) : results;
      const nextCursor = hasNextPage ? items[items.length - 1].id : null;

      return res.json({
        success: true,
        data: items,
        pageInfo: {
          nextCursor,
          hasNextPage,
          pageSize
        },
        filters: {
          applied: status || 'all',
          available: ['all', 'scheduled', 'completed', 'cancelled']
        }
      });
    } catch (cursorError) {
      console.error('Cursor pagination failed, falling back to offset:', cursorError?.message || cursorError);
      // Fallback: offset pagination (first page only) to avoid hard failure
      const offsetResults = await prisma.booking.findMany({
        where: whereClause,
        include: findArgs.include,
        orderBy: { createdAt: 'desc' },
        take: pageSize,
        skip: 0,
      });
      const hasNextPage = offsetResults.length === pageSize; // best-effort
      const nextCursor = hasNextPage ? offsetResults[offsetResults.length - 1]?.id || null : null;
      return res.json({
        success: true,
        data: offsetResults,
        pageInfo: {
          nextCursor,
          hasNextPage,
          pageSize
        },
        filters: {
          applied: status || 'all',
          available: ['all', 'scheduled', 'completed', 'cancelled']
        }
      });
    }
  } catch (error) {
    console.error('Error fetching user bookings:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch user bookings'
    });
  }
};

const getMaidBookings = async (req, res) => {
  try {
    const maidId = req.user.id;
    const { status, cursor, limit = 10 } = req.query;

    // Build where clause based on status filter
    let whereClause = {
      maidId: maidId
    };

    // Apply status filtering based on frontend requirements
    if (status) {
      switch (status.toLowerCase()) {
        case 'scheduled':
          // Include bookings that are confirmed, assigned, or in progress
          whereClause.status = { in: ['CONFIRMED', 'ASSIGNED', 'IN_PROGRESS'] };
          break;
        case 'completed':
          whereClause.status = 'COMPLETED';
          break;
        case 'cancelled':
          whereClause.status = 'CANCELLED';
          break;
        case 'all':
        default:
          // No additional filter - return all bookings
          break;
      }
    }

    const pageSize = Math.max(1, Math.min(parseInt(limit, 10) || 10, 50));

    const findArgs = {
      where: whereClause,
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
      },
      orderBy: { id: 'desc' },
      take: pageSize + 1
    };

    if (cursor) {
      findArgs.cursor = { id: cursor };
      findArgs.skip = 1;
    }

    const results = await prisma.booking.findMany(findArgs);
    const hasNextPage = results.length > pageSize;
    const items = hasNextPage ? results.slice(0, pageSize) : results;
    const nextCursor = hasNextPage ? items[items.length - 1].id : null;

    res.json({
      success: true,
      data: items,
      pageInfo: {
        nextCursor,
        hasNextPage,
        pageSize
      },
      filters: {
        applied: status || 'all',
        available: ['all', 'scheduled', 'completed', 'cancelled']
      }
    });
  } catch (error) {
    console.error('Error fetching maid bookings:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch maid bookings'
    });
  }
};

const assignMaid = async (req, res) => {
  try {
    const { id } = req.params;
    const { maidId } = req.body;

    const booking = await prisma.booking.update({
      where: { id },
      data: {
        maidId,
        status: 'ASSIGNED'
      },
      include: {
        service: true,
        customer: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true
          }
        },
        maid: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true
          }
        }
      }
    });

    // Make this maid the default for the customer
    await prisma.customerMaidAssignment.upsert({
      where: {
        customerId: booking.customerId
      },
      update: {
        maidId: maidId,
        isActive: true,
        assignedAt: new Date()
      },
      create: {
        customerId: booking.customerId,
        maidId: maidId,
        isActive: true,
        assignedAt: new Date()
      }
    });

    await publishNotificationEvent({
      topic: NOTIFICATION_TOPICS.BOOKING_MAID_ASSIGNED,
      payload: { bookingId: booking.id },
      dedupeKey: `booking-maid-assigned:${booking.id}:${booking.updatedAt.toISOString()}`
    });

    res.json(booking);
  } catch (error) {
    console.error('Error assigning maid:', error);
    res.status(500).json({ message: 'Failed to assign maid' });
  }
};

const updateBookingStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!['PENDING', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'].includes(status)) {
      return res.status(400).json({ message: 'Invalid status' });
    }

    const booking = await prisma.booking.update({
      where: { id },
      data: {
        status,
        ...(status === 'COMPLETED' && { completedAt: new Date() }),
        ...(status === 'IN_PROGRESS' && { actualStartTime: new Date() })
      },
      include: {
        service: true,
        customer: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true
          }
        },
        maid: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true
          }
        }
      }
    });

    // Keep legacy in-app behavior for now for detailed lifecycle signals.
    // Production path should publish dedicated outbox topics per lifecycle event.
    if (status === 'COMPLETED') {
      await notificationService.notifyServiceCompleted(booking);
    } else if (status === 'IN_PROGRESS') {
      await notificationService.notifyServiceStarted(booking);
    } else {
      await notificationService.notifyBookingStatusChange(booking, status);
    }

    res.json(booking);
  } catch (error) {
    console.error('Error updating booking status:', error);
    res.status(500).json({ message: 'Failed to update booking status' });
  }
};

const cancelBooking = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason = 'Cancelled by admin' } = req.body;
    const userId = req.user.id;
    const userRole = req.user.role;

    // Get booking first to check permissions
    const existingBooking = await prisma.booking.findUnique({
      where: { id },
      include: {
        customer: true
      }
    });

    if (!existingBooking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    // Check permissions - only admin or booking owner can cancel
    if (userRole !== 'ADMIN' && existingBooking.customerId !== userId) {
      return res.status(403).json({
        success: false,
        message: 'You can only cancel your own bookings'
      });
    }

    // Check if booking can be cancelled (not already completed/cancelled)
    if (['COMPLETED', 'CANCELLED'].includes(existingBooking.status)) {
      return res.status(400).json({
        success: false,
        message: `Cannot cancel booking that is already ${existingBooking.status.toLowerCase()}`
      });
    }

    const booking = await prisma.booking.update({
      where: { id },
      data: {
        status: 'CANCELLED',
        notes: `${existingBooking.notes || ''}\nCancelled: ${reason}`
      },
      include: {
        service: true,
        customer: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true
          }
        },
        maid: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true
          }
        }
      }
    });

    // Send notification
    await notificationService.notifyBookingCancellation(booking, reason);

    res.json({
      success: true,
      data: { booking },
      message: 'Booking cancelled successfully'
    });
  } catch (error) {
    console.error('Error cancelling booking:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to cancel booking'
    });
  }
};

// Complete booking payment and confirm booking
const completeBookingPayment = async (req, res) => {
  try {
    const { bookingId, paymentId, transactionId, gateway, gatewayResponse } = req.body;
    const userId = req.user.id;

    if (!bookingId || !paymentId || !transactionId) {
      return res.status(400).json({
        error: 'Missing required fields: bookingId, paymentId, transactionId'
      });
    }

    // Verify payment belongs to user and booking
    const payment = await prisma.payment.findUnique({
      where: { id: paymentId },
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
      }
    });

    if (!payment) {
      return res.status(404).json({ error: 'Payment not found' });
    }

    if (payment.customerId !== userId || payment.bookingId !== bookingId) {
      return res.status(403).json({ error: 'Unauthorized access to payment' });
    }

    if (payment.booking.customerId !== userId) {
      return res.status(403).json({ error: 'Unauthorized access to booking' });
    }

    // Update payment status
    await prisma.payment.update({
      where: { id: paymentId },
      data: {
        status: 'COMPLETED',
        transactionId,
        gateway,
        gatewayResponse
      }
    });

    // Update booking status to CONFIRMED
    const booking = await prisma.booking.update({
      where: { id: bookingId },
      data: {
        status: 'CONFIRMED'
      },
      include: {
        service: true,
        customer: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true
          }
        },
        payment: true
      }
    });

    res.json({
      success: true,
      message: 'Booking payment completed and booking confirmed successfully',
      booking
    });

  } catch (error) {
    console.error('Error completing booking payment:', error);
    res.status(500).json({ error: 'Failed to complete booking payment' });
  }
};

const getAvailableSlots = async (req, res) => {
  try {
    const { date } = req.query;
    const customerId = req.user.id;

    if (!date) {
      return res.status(400).json({
        success: false,
        message: 'Date parameter is required'
      });
    }

    // Get customer profile with subscription
    const customerProfile = await prisma.customerProfile.findUnique({
      where: { userId: customerId },
      include: {
        subscription: {
          where: {
            status: 'ACTIVE',
            endDate: { gte: new Date() }
          }
        }
      }
    });

    if (!customerProfile || !customerProfile.subscription) {
      return res.status(403).json({
        success: false,
        message: 'Active subscription required to check available slots'
      });
    }

    // Check if the requested date falls within any active buffer period
    // Extract just the date part for comparison (ignore time)
    const requestDate = new Date(date);
    const requestDateOnly = new Date(requestDate.getFullYear(), requestDate.getMonth(), requestDate.getDate());

    console.log(`🔍 Checking available slots for date: ${date} (${requestDateOnly.toISOString()})`);

    const bufferConflict = await prisma.bufferPeriod.findFirst({
      where: {
        subscriptionId: customerProfile.subscription.id,
        status: 'ACTIVE',
        startDate: { lte: requestDateOnly },
        endDate: { gte: requestDateOnly }
      }
    });

    if (bufferConflict) {
      console.log(`❌ Available slots blocked - Buffer conflict: ${bufferConflict.startDate} to ${bufferConflict.endDate}`);
    } else {
      console.log(`✅ Available slots allowed for date: ${date}`);
    }

    // If date is in buffer period, return empty slots with explanation
    if (bufferConflict) {
      return res.json({
        success: true,
        data: {
          slots: [],
          isBufferPeriod: true,
          message: `No slots available on ${requestDate.toLocaleDateString()}. This date falls within your buffer period (${new Date(bufferConflict.startDate).toLocaleDateString()} - ${new Date(bufferConflict.endDate).toLocaleDateString()}).`,
          bufferPeriod: {
            startDate: bufferConflict.startDate,
            endDate: bufferConflict.endDate
          }
        }
      });
    }

    // Standard time slots (you can customize these based on your business hours)
    const standardSlots = [
      '09:00-12:00',
      '12:00-15:00',
      '15:00-18:00',
      '18:00-21:00'
    ];

    // Get existing bookings for the date
    const existingBookings = await prisma.booking.findMany({
      where: {
        scheduledAt: {
          gte: new Date(`${date}T00:00:00`),
          lte: new Date(`${date}T23:59:59`)
        },
        status: {
          in: ['CONFIRMED', 'ASSIGNED', 'IN_PROGRESS']
        }
      },
      select: {
        timeSlot: true
      }
    });

    // Filter out booked slots
    const bookedSlots = existingBookings.map(booking => booking.timeSlot).filter(Boolean);
    const availableSlots = standardSlots.filter(slot => !bookedSlots.includes(slot));

    res.json({
      success: true,
      data: {
        slots: availableSlots,
        isBufferPeriod: false,
        date: date,
        totalSlots: standardSlots.length,
        bookedSlots: bookedSlots.length,
        availableSlots: availableSlots.length
      }
    });

  } catch (error) {
    console.error('Error fetching available slots:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch available slots',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

const getBookingStats = async (req, res) => {
  try {
    const userId = req.user.id;
    const { role } = req.user;

    // Build where clause based on user role
    let whereClause = {};
    if (role === 'CUSTOMER') {
      whereClause.customerId = userId;
    } else if (role === 'MAID') {
      whereClause.maidId = userId;
    }
    // For admin, no where clause needed (gets all bookings)

    // Get counts for each status category
    const [total, scheduled, completed, cancelled] = await Promise.all([
      prisma.booking.count({ where: whereClause }),
      prisma.booking.count({
        where: {
          ...whereClause,
          status: { in: ['CONFIRMED', 'ASSIGNED', 'IN_PROGRESS'] }
        }
      }),
      prisma.booking.count({
        where: {
          ...whereClause,
          status: 'COMPLETED'
        }
      }),
      prisma.booking.count({
        where: {
          ...whereClause,
          status: 'CANCELLED'
        }
      })
    ]);

    res.json({
      success: true,
      data: {
        total,
        scheduled,
        completed,
        cancelled
      },
      filters: ['all', 'scheduled', 'completed', 'cancelled']
    });
  } catch (error) {
    console.error('Error fetching booking stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch booking statistics'
    });
  }
};

module.exports = {
  createBooking,
  getAllBookings,
  getBookingById,
  getUserBookings,
  getMaidBookings,
  assignMaid,
  updateBookingStatus,
  cancelBooking,
  completeBookingPayment,
  getAvailableSlots,
  getBookingStats
};
