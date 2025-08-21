const { PrismaClient } = require('@prisma/client');
const notificationService = require('../services/notificationService');
const prisma = new PrismaClient();

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

    // Customer has active subscription - create booking with no payment required
    const bookingData = {
      customerId,
      serviceId: service.id,
      serviceAddress: finalAddress, // Use finalAddress (from request or user profile)
      status: 'CONFIRMED', // Direct confirmation for subscription customers
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

    // Send notification for booking creation
    await notificationService.notifyBookingCreated(booking);

    // Return successful response
    res.status(201).json({
      success: true,
      data: {
        booking
      },
      message: 'Booking created successfully. No additional payment required as you have an active subscription.',
      hasActiveSubscription: true
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
    console.error('Error fetching bookings:', error);
    res.status(500).json({ 
      success: false,
      message: 'Failed to fetch bookings' 
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
    const { status } = req.query;
    
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
    
    const bookings = await prisma.booking.findMany({
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
      orderBy: {
        scheduledAt: 'desc' // Most recent first
      }
    });
    
    res.json({
      success: true,
      data: bookings,
      filters: {
        applied: status || 'all',
        available: ['all', 'scheduled', 'completed', 'cancelled']
      }
    });
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
    const { status } = req.query;
    
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
        }
      },
      orderBy: {
        scheduledAt: 'desc' // Most recent first
      }
    });
    
    res.json({
      success: true,
      data: bookings,
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

const   assignMaid = async (req, res) => {
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

    // Send notification
    await notificationService.notifyMaidAssigned(booking);

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

    // Send notifications based on status
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
    const { reason = 'Cancelled by user' } = req.body;
    
    const booking = await prisma.booking.update({
      where: { id },
      data: { status: 'CANCELLED' },
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

    res.json(booking);
  } catch (error) {
    console.error('Error cancelling booking:', error);
    res.status(500).json({ message: 'Failed to cancel booking' });
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
  getBookingStats
};
